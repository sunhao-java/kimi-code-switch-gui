//! 用量洞察 SQLite 后端（rusqlite）。对应 Electron 侧 better-sqlite3 的 usageDb.ts。
//!
//! 设计：Rust 持有连接，前端传 SQL + 具名参数。SQL 语句、时间计算、游标编解码、
//! 日志解析等纯逻辑全部保留在前端 TS（usageDb 的 27 条 SQL 几乎原样下传）。
//!
//! 数据库文件：~/.kimi-code/.panel/app.db（全局应用数据库）
//! 包含表：usage 相关表、config_history、panel_settings

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::types::{Value, ValueRef};
use rusqlite::Connection;
use serde_json::{Map, Number, Value as Json};

pub struct UsageState {
    pub conn: Mutex<Option<Connection>>,
}

impl Default for UsageState {
    fn default() -> Self {
        Self {
            conn: Mutex::new(None),
        }
    }
}

fn resolve_home(path: &str) -> PathBuf {
    if let Some(stripped) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(stripped);
        }
    }
    PathBuf::from(path)
}

/// 把前端传来的 JSON 参数值转成 rusqlite 可绑定的值。
fn json_to_sql(value: &Json) -> Value {
    match value {
        Json::Null => Value::Null,
        Json::Bool(b) => Value::Integer(if *b { 1 } else { 0 }),
        Json::Number(n) => {
            if let Some(i) = n.as_i64() {
                Value::Integer(i)
            } else if let Some(f) = n.as_f64() {
                Value::Real(f)
            } else {
                Value::Null
            }
        }
        Json::String(s) => Value::Text(s.clone()),
        other => Value::Text(other.to_string()),
    }
}

/// 把 SQLite 列值转成 JSON。
fn sql_to_json(value: ValueRef) -> Json {
    match value {
        ValueRef::Null => Json::Null,
        ValueRef::Integer(i) => Json::Number(Number::from(i)),
        ValueRef::Real(f) => Number::from_f64(f).map(Json::Number).unwrap_or(Json::Null),
        ValueRef::Text(t) => Json::String(String::from_utf8_lossy(t).to_string()),
        ValueRef::Blob(b) => Json::String(String::from_utf8_lossy(b).to_string()),
    }
}

/// 绑定具名参数：键统一加 `@` 前缀（前端按 usageDb 习惯传 `from_day` 等裸名）。
fn bind_named<'a>(
    stmt: &mut rusqlite::Statement<'a>,
    params: &'a HashMap<String, Json>,
) -> Result<(), String> {
    for (key, val) in params {
        let at_key = format!("@{key}");
        if let Some(idx) = stmt.parameter_index(&at_key).map_err(|e| e.to_string())? {
            stmt.raw_bind_parameter(idx, json_to_sql(val))
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// 打开（或新建）数据库并执行 schema。dbPath 支持 ~/ 前缀。
#[tauri::command]
pub fn usage_open(
    db_path: String,
    schema_sql: String,
    state: tauri::State<UsageState>,
) -> Result<(), String> {
    let resolved = resolve_home(&db_path);
    if let Some(parent) = resolved.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("ensure db dir: {e}"))?;
    }
    let conn = Connection::open(&resolved).map_err(|e| format!("open db: {e}"))?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON; \
         PRAGMA temp_store=MEMORY; PRAGMA busy_timeout=5000;",
    )
    .map_err(|e| format!("pragma: {e}"))?;
    conn.execute_batch(&schema_sql)
        .map_err(|e| format!("schema: {e}"))?;
    *state.conn.lock().unwrap() = Some(conn);
    Ok(())
}

/// 执行查询，返回行数组（每行是 列名→值 的对象）。
#[tauri::command]
pub fn usage_query(
    sql: String,
    params: Option<HashMap<String, Json>>,
    state: tauri::State<UsageState>,
) -> Result<Vec<Map<String, Json>>, String> {
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("db not open")?;
    let params = params.unwrap_or_default();

    let mut stmt = conn.prepare(&sql).map_err(|e| format!("prepare: {e}"))?;
    let col_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let col_count = col_names.len();

    bind_named(&mut stmt, &params)?;
    let mut rows = stmt.raw_query();

    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| format!("row: {e}"))? {
        let mut obj = Map::new();
        for i in 0..col_count {
            let v = row.get_ref(i).map_err(|e| format!("get col {i}: {e}"))?;
            obj.insert(col_names[i].clone(), sql_to_json(v));
        }
        out.push(obj);
    }
    Ok(out)
}

/// 执行写语句（INSERT/UPDATE/DELETE/DDL），返回受影响行数。
#[tauri::command]
pub fn usage_exec(
    sql: String,
    params: Option<HashMap<String, Json>>,
    state: tauri::State<UsageState>,
) -> Result<usize, String> {
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("db not open")?;
    let params = params.unwrap_or_default();

    let mut stmt = conn.prepare(&sql).map_err(|e| format!("prepare: {e}"))?;
    bind_named(&mut stmt, &params)?;
    let changes = stmt.raw_execute().map_err(|e| format!("execute: {e}"))?;
    Ok(changes)
}

/// 批量插入事件：在单事务内执行同一条 INSERT 多次，返回成功插入数。
/// 对应 usageDb.insertEventsBatch（避免逐行 IPC 往返）。
#[tauri::command]
pub fn usage_exec_batch(
    sql: String,
    rows: Vec<HashMap<String, Json>>,
    state: tauri::State<UsageState>,
) -> Result<usize, String> {
    let mut guard = state.conn.lock().unwrap();
    let conn = guard.as_mut().ok_or("db not open")?;
    let tx = conn.transaction().map_err(|e| format!("tx: {e}"))?;
    let mut inserted = 0usize;
    {
        let mut stmt = tx.prepare(&sql).map_err(|e| format!("prepare: {e}"))?;
        for row in &rows {
            bind_named(&mut stmt, row)?;
            inserted += stmt.raw_execute().map_err(|e| format!("execute: {e}"))?;
        }
    }
    tx.commit().map_err(|e| format!("commit: {e}"))?;
    Ok(inserted)
}

/// 执行多条语句（无返回）。用于 purgeAll 等。
#[tauri::command]
pub fn usage_exec_script(sql: String, state: tauri::State<UsageState>) -> Result<(), String> {
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("db not open")?;
    conn.execute_batch(&sql)
        .map_err(|e| format!("exec script: {e}"))
}

#[tauri::command]
pub fn usage_close(state: tauri::State<UsageState>) -> Result<(), String> {
    *state.conn.lock().unwrap() = None;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_to_sql_maps_primitive_kinds() {
        assert!(matches!(json_to_sql(&Json::Null), Value::Null));
        assert!(matches!(json_to_sql(&Json::Bool(true)), Value::Integer(1)));
        assert!(matches!(json_to_sql(&Json::Bool(false)), Value::Integer(0)));
        assert!(matches!(
            json_to_sql(&Json::Number(Number::from(42))),
            Value::Integer(42)
        ));
        match json_to_sql(&Json::Number(Number::from_f64(1.5).unwrap())) {
            Value::Real(f) => assert_eq!(f, 1.5),
            other => panic!("expected Real, got {other:?}"),
        }
        match json_to_sql(&Json::String("hi".into())) {
            Value::Text(t) => assert_eq!(t, "hi"),
            other => panic!("expected Text, got {other:?}"),
        }
    }

    #[test]
    fn json_to_sql_serializes_compound_kinds_as_text() {
        // 数组/对象等复合类型转字符串文本，避免绑定失败。
        let arr = serde_json::json!([1, 2]);
        match json_to_sql(&arr) {
            Value::Text(t) => assert_eq!(t, "[1,2]"),
            other => panic!("expected Text, got {other:?}"),
        }
    }

    #[test]
    fn resolve_home_expands_tilde_prefix() {
        let home = dirs::home_dir().expect("home dir required");
        assert_eq!(
            resolve_home("~/.kimi/usage.db"),
            home.join(".kimi/usage.db")
        );
    }

    #[test]
    fn resolve_home_keeps_plain_path() {
        assert_eq!(
            resolve_home("/tmp/usage.db"),
            PathBuf::from("/tmp/usage.db")
        );
    }

    fn make_table_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE events (id INTEGER PRIMARY KEY, name TEXT, amount INTEGER);",
        )
        .unwrap();
        conn
    }

    #[test]
    fn bind_named_maps_named_params_and_returns_rows() {
        let conn = make_table_conn();
        conn.execute(
            "INSERT INTO events (name, amount) VALUES ('a', 10), ('b', 20), ('a', 30)",
            [],
        )
        .unwrap();

        let mut params: HashMap<String, Json> = HashMap::new();
        params.insert("name".into(), Json::String("a".into()));

        let mut stmt = conn
            .prepare("SELECT amount FROM events WHERE name = @name ORDER BY amount")
            .unwrap();
        bind_named(&mut stmt, &params).unwrap();
        let mut rows = stmt.raw_query();

        let mut amounts = Vec::new();
        while let Some(row) = rows.next().unwrap() {
            let v = row.get_ref(0).unwrap();
            amounts.push(sql_to_json(v));
        }
        // 多行映射：name='a' 命中两行 10 与 30。
        assert_eq!(amounts.len(), 2);
        assert_eq!(amounts[0], Json::Number(Number::from(10)));
        assert_eq!(amounts[1], Json::Number(Number::from(30)));
    }

    #[test]
    fn bind_named_empty_result_set() {
        let conn = make_table_conn();
        let mut params: HashMap<String, Json> = HashMap::new();
        params.insert("name".into(), Json::String("missing".into()));

        let mut stmt = conn
            .prepare("SELECT amount FROM events WHERE name = @name")
            .unwrap();
        bind_named(&mut stmt, &params).unwrap();
        let mut rows = stmt.raw_query();
        assert!(rows.next().unwrap().is_none());
    }

    #[test]
    fn bind_named_ignores_unused_param_keys() {
        // SQL 中不含 @ghost 占位符，多余的键应被静默跳过（parameter_index 返回 None）。
        let conn = make_table_conn();
        let mut params: HashMap<String, Json> = HashMap::new();
        params.insert("name".into(), Json::String("a".into()));
        params.insert("ghost".into(), Json::Number(Number::from(99)));

        let mut stmt = conn
            .prepare("SELECT amount FROM events WHERE name = @name")
            .unwrap();
        // 不应 panic / 报错。
        bind_named(&mut stmt, &params).unwrap();
    }

    #[test]
    fn sql_to_json_maps_column_kinds() {
        assert_eq!(sql_to_json(ValueRef::Null), Json::Null);
        assert_eq!(
            sql_to_json(ValueRef::Integer(7)),
            Json::Number(Number::from(7))
        );
        assert_eq!(
            sql_to_json(ValueRef::Text(b"hello")),
            Json::String("hello".into())
        );
    }
}

/// 迁移旧数据库到新路径。
///
/// 将 ~/.kimi/.panel/usage/index.db 的所有表和数据复制到当前连接的数据库。
/// 迁移完成后，重命名旧数据库为 index.db.migrated。
#[tauri::command]
pub fn migrate_legacy_database(state: tauri::State<UsageState>) -> Result<String, String> {
    let old_db_path = resolve_home("~/.kimi/.panel/usage/index.db");

    // 检查旧数据库是否存在
    if !old_db_path.exists() {
        return Ok("No legacy database found, migration skipped".to_string());
    }

    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("usage db not open")?;

    // ATTACH 旧数据库
    conn.execute(
        &format!("ATTACH DATABASE '{}' AS legacy", old_db_path.display()),
        [],
    )
    .map_err(|e| format!("attach legacy db: {e}"))?;

    // 获取旧数据库中的所有表
    let tables: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT name FROM legacy.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
            .map_err(|e| format!("query tables: {e}"))?;

        let rows = stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| format!("map tables: {e}"))?;

        rows.collect::<Result<Vec<String>, _>>()
            .map_err(|e| format!("collect tables: {e}"))?
    };

    let mut migrated_tables = Vec::new();

    // 复制每个表
    for table in &tables {
        // 跳过已存在的表（避免覆盖）
        let exists: bool = conn
            .query_row(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?1",
                [table],
                |_| Ok(true),
            )
            .unwrap_or(false);

        if exists {
            log::info!("Table {} already exists, skipping", table);
            continue;
        }

        // 复制表结构
        let create_sql: String = conn
            .query_row(
                &format!(
                    "SELECT sql FROM legacy.sqlite_master WHERE type='table' AND name = '{}'",
                    table
                ),
                [],
                |row| row.get(0),
            )
            .map_err(|e| format!("get create sql for {}: {e}", table))?;

        conn.execute_batch(&create_sql)
            .map_err(|e| format!("create table {}: {e}", table))?;

        // 复制数据
        conn.execute(
            &format!("INSERT INTO main.{} SELECT * FROM legacy.{}", table, table),
            [],
        )
        .map_err(|e| format!("copy data for {}: {e}", table))?;

        migrated_tables.push(table.clone());
        log::info!("Migrated table: {}", table);
    }

    // DETACH 旧数据库
    conn.execute("DETACH DATABASE legacy", [])
        .map_err(|e| format!("detach legacy db: {e}"))?;

    drop(guard);

    // 重命名旧数据库
    let migrated_path = old_db_path.with_extension("db.migrated");
    std::fs::rename(&old_db_path, &migrated_path).map_err(|e| format!("rename legacy db: {e}"))?;

    log::info!(
        "Legacy database migrated and renamed to {:?}",
        migrated_path
    );

    Ok(format!(
        "Migrated {} tables: {}. Old database renamed to index.db.migrated",
        migrated_tables.len(),
        migrated_tables.join(", ")
    ))
}
