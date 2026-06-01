//! 用量洞察 SQLite 后端（rusqlite）。对应 Electron 侧 better-sqlite3 的 usageDb.ts。
//!
//! 设计：Rust 持有连接，前端传 SQL + 具名参数。SQL 语句、时间计算、游标编解码、
//! 日志解析等纯逻辑全部保留在前端 TS（usageDb 的 27 条 SQL 几乎原样下传）。

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
    conn.execute_batch(&sql).map_err(|e| format!("exec script: {e}"))
}

#[tauri::command]
pub fn usage_close(state: tauri::State<UsageState>) -> Result<(), String> {
    *state.conn.lock().unwrap() = None;
    Ok(())
}
