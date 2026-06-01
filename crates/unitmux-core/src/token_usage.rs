use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TokenUsageSource {
    ClaudeJsonl,
    CodexJsonl,
    None,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsageSlice {
    pub input: u64,
    pub cached_input: u64,
    pub output: u64,
    pub reasoning_output: u64,
    pub total: u64,
    pub cache_hit_rate: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsage {
    pub input: u64,
    pub cached_input: u64,
    pub output: u64,
    pub reasoning_output: u64,
    pub total: u64,
    pub cache_hit_rate: Option<f64>,
    pub last_request: Option<TokenUsageSlice>,
    pub updated_at: Option<String>,
    pub source: TokenUsageSource,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsageSummary {
    pub all: TokenUsage,
    pub claude: TokenUsage,
    pub codex: TokenUsage,
    pub updated_at: Option<String>,
}

pub fn create_empty_token_usage(source: TokenUsageSource) -> TokenUsage {
    TokenUsage {
        input: 0,
        cached_input: 0,
        output: 0,
        reasoning_output: 0,
        total: 0,
        cache_hit_rate: None,
        last_request: None,
        updated_at: None,
        source,
    }
}

pub fn parse_claude_token_usage_from_jsonl(raw: &str) -> TokenUsage {
    let mut requests: HashMap<String, (TokenUsageSlice, Option<String>)> = HashMap::new();
    let mut order = Vec::new();
    let mut fallback_index = 0;

    for line in raw.lines().filter(|line| !line.trim().is_empty()) {
        let Ok(record) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let Some(slice) = usage_from_claude_record(&record) else {
            continue;
        };
        let request_id = record
            .get("requestId")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| {
                let id = format!("line:{fallback_index}");
                fallback_index += 1;
                id
            });
        if !requests.contains_key(&request_id) {
            order.push(request_id.clone());
        }
        requests.insert(
            request_id,
            (
                slice,
                record
                    .get("timestamp")
                    .and_then(Value::as_str)
                    .map(str::to_string),
            ),
        );
    }

    let values = order
        .iter()
        .filter_map(|id| requests.get(id))
        .collect::<Vec<_>>();
    let mut usage = aggregate_slices(
        values.iter().map(|(slice, _)| (*slice).clone()).collect(),
        TokenUsageSource::ClaudeJsonl,
    );
    if let Some((slice, timestamp)) = values.last() {
        usage.last_request = Some((*slice).clone());
        usage.updated_at = timestamp.clone();
    }
    usage
}

pub fn parse_codex_token_usage_from_jsonl(raw: &str) -> TokenUsage {
    let mut total_usage = None;
    let mut last_request = None;
    let mut updated_at = None;

    for line in raw.lines().filter(|line| !line.trim().is_empty()) {
        let Ok(record) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let payload = record.get("payload").unwrap_or(&Value::Null);
        let next_total = usage_from_codex_object(payload.get("total_token_usage"));
        let next_last = usage_from_codex_object(payload.get("last_token_usage"));
        if let Some(next_total) = next_total {
            total_usage = Some(next_total);
            if let Some(timestamp) = record.get("timestamp").and_then(Value::as_str) {
                updated_at = Some(timestamp.to_string());
            }
        }
        if next_last.is_some() {
            last_request = next_last;
        }
    }

    let mut usage = total_usage
        .map(|slice| TokenUsage {
            input: slice.input,
            cached_input: slice.cached_input,
            output: slice.output,
            reasoning_output: slice.reasoning_output,
            total: slice.total,
            cache_hit_rate: slice.cache_hit_rate,
            last_request: None,
            updated_at: None,
            source: TokenUsageSource::CodexJsonl,
        })
        .unwrap_or_else(|| create_empty_token_usage(TokenUsageSource::CodexJsonl));
    usage.last_request = last_request;
    usage.updated_at = updated_at;
    usage
}

pub fn aggregate_token_usage(usages: Vec<TokenUsage>) -> TokenUsageSummary {
    let all = aggregate_slices(
        usages.iter().map(slice_from_usage).collect(),
        TokenUsageSource::None,
    );
    let claude = aggregate_slices(
        usages
            .iter()
            .filter(|usage| usage.source == TokenUsageSource::ClaudeJsonl)
            .map(slice_from_usage)
            .collect(),
        TokenUsageSource::ClaudeJsonl,
    );
    let codex = aggregate_slices(
        usages
            .iter()
            .filter(|usage| usage.source == TokenUsageSource::CodexJsonl)
            .map(slice_from_usage)
            .collect(),
        TokenUsageSource::CodexJsonl,
    );
    let updated_at = usages
        .iter()
        .filter_map(|usage| usage.updated_at.clone())
        .max();

    TokenUsageSummary {
        all,
        claude,
        codex,
        updated_at,
    }
}

pub fn get_token_usage_for_claude_jsonl(file_path: impl AsRef<Path>) -> TokenUsage {
    read_usage_file(file_path, parse_claude_token_usage_from_jsonl)
}

pub fn get_token_usage_for_codex_jsonl(file_path: impl AsRef<Path>) -> TokenUsage {
    read_usage_file(file_path, parse_codex_token_usage_from_jsonl)
}

pub fn find_codex_session_jsonl(
    home_dir: impl AsRef<Path>,
    session_id: &str,
    cwd: Option<&str>,
) -> Option<PathBuf> {
    let archived_dir = home_dir.as_ref().join(".codex").join("archived_sessions");
    let entries = fs::read_dir(&archived_dir).ok()?;
    let files = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "jsonl"))
        .collect::<Vec<_>>();

    if !session_id.is_empty() {
        if let Some(path) = files.iter().find(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.ends_with(&format!("{session_id}.jsonl")))
        }) {
            return Some(path.clone());
        }
    }

    let cwd = cwd?;
    files
        .into_iter()
        .filter_map(|path| {
            let first_line = read_first_line(&path).ok()?;
            let meta = serde_json::from_str::<Value>(&first_line).ok()?;
            if meta.get("type").and_then(Value::as_str) != Some("session_meta")
                || meta
                    .get("payload")
                    .and_then(|payload| payload.get("cwd"))
                    .and_then(Value::as_str)
                    != Some(cwd)
            {
                return None;
            }
            let modified = fs::metadata(&path).ok()?.modified().ok()?;
            Some((path, modified))
        })
        .max_by_key(|(_, modified)| *modified)
        .map(|(path, _)| path)
}

pub fn get_token_usage_summary_from_home(home_dir: impl AsRef<Path>) -> TokenUsageSummary {
    let home_dir = home_dir.as_ref();
    let mut usages = Vec::new();

    for file in list_claude_jsonl_files(home_dir) {
        usages.push(get_token_usage_for_claude_jsonl(file));
    }
    for file in list_codex_jsonl_files(home_dir) {
        usages.push(get_token_usage_for_codex_jsonl(file));
    }

    aggregate_token_usage(usages)
}

fn read_usage_file(file_path: impl AsRef<Path>, parser: fn(&str) -> TokenUsage) -> TokenUsage {
    fs::read_to_string(file_path)
        .map(|raw| parser(&raw))
        .unwrap_or_else(|_| create_empty_token_usage(TokenUsageSource::None))
}

fn read_first_line(file_path: impl AsRef<Path>) -> std::io::Result<String> {
    let file = fs::File::open(file_path)?;
    let mut reader = BufReader::new(file);
    let mut line = String::new();
    reader.read_line(&mut line)?;
    Ok(line)
}

fn list_claude_jsonl_files(home_dir: &Path) -> Vec<PathBuf> {
    let projects_dir = home_dir.join(".claude").join("projects");
    let Ok(entries) = fs::read_dir(projects_dir) else {
        return Vec::new();
    };

    entries
        .flatten()
        .filter_map(|entry| {
            entry
                .file_type()
                .ok()
                .filter(|file_type| file_type.is_dir())
                .map(|_| entry.path())
        })
        .flat_map(|project_dir| {
            fs::read_dir(project_dir)
                .into_iter()
                .flatten()
                .flatten()
                .map(|entry| entry.path())
                .filter(|path| path.extension().is_some_and(|ext| ext == "jsonl"))
                .collect::<Vec<_>>()
        })
        .collect()
}

fn list_codex_jsonl_files(home_dir: &Path) -> Vec<PathBuf> {
    let archived_dir = home_dir.join(".codex").join("archived_sessions");
    fs::read_dir(archived_dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "jsonl"))
        .collect()
}

fn usage_from_claude_record(record: &Value) -> Option<TokenUsageSlice> {
    let usage = record.get("message")?.get("usage")?;
    let raw_input = to_u64(usage.get("input_tokens"));
    let cache_created = to_u64(usage.get("cache_creation_input_tokens"));
    let cached_input = to_u64(usage.get("cache_read_input_tokens"));
    let input = raw_input + cache_created + cached_input;
    let output = to_u64(usage.get("output_tokens"));
    Some(create_slice(input, cached_input, output, 0, None))
}

fn usage_from_codex_object(value: Option<&Value>) -> Option<TokenUsageSlice> {
    let usage = value?;
    let input = to_u64(usage.get("input_tokens"));
    let cached_input = to_u64(usage.get("cached_input_tokens"));
    let output = to_u64(usage.get("output_tokens"));
    let reasoning_output = to_u64(usage.get("reasoning_output_tokens"));
    let total = to_u64(usage.get("total_tokens"));
    if input == 0 && cached_input == 0 && output == 0 && reasoning_output == 0 && total == 0 {
        return None;
    }
    Some(create_slice(
        input,
        cached_input,
        output,
        reasoning_output,
        (total != 0).then_some(total),
    ))
}

fn aggregate_slices(slices: Vec<TokenUsageSlice>, source: TokenUsageSource) -> TokenUsage {
    let (input, cached_input, output, reasoning_output, total) =
        slices.iter().fold((0, 0, 0, 0, 0), |acc, usage| {
            (
                acc.0 + usage.input,
                acc.1 + usage.cached_input,
                acc.2 + usage.output,
                acc.3 + usage.reasoning_output,
                acc.4 + usage.total,
            )
        });
    TokenUsage {
        input,
        cached_input,
        output,
        reasoning_output,
        total,
        cache_hit_rate: cache_hit_rate(input, cached_input),
        last_request: None,
        updated_at: None,
        source,
    }
}

fn slice_from_usage(usage: &TokenUsage) -> TokenUsageSlice {
    TokenUsageSlice {
        input: usage.input,
        cached_input: usage.cached_input,
        output: usage.output,
        reasoning_output: usage.reasoning_output,
        total: usage.total,
        cache_hit_rate: usage.cache_hit_rate,
    }
}

fn create_slice(
    input: u64,
    cached_input: u64,
    output: u64,
    reasoning_output: u64,
    total: Option<u64>,
) -> TokenUsageSlice {
    TokenUsageSlice {
        input,
        cached_input,
        output,
        reasoning_output,
        total: total.unwrap_or(input + output),
        cache_hit_rate: cache_hit_rate(input, cached_input),
    }
}

fn cache_hit_rate(input: u64, cached_input: u64) -> Option<f64> {
    (input > 0).then_some(cached_input as f64 / input as f64)
}

fn to_u64(value: Option<&Value>) -> u64 {
    value.and_then(Value::as_u64).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs::{create_dir_all, remove_dir_all, write};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_home() -> PathBuf {
        std::env::temp_dir().join(format!(
            "unitmux-token-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock should be after epoch")
                .as_nanos()
        ))
    }

    #[test]
    fn parses_claude_token_usage_with_unique_request_ids() {
        let jsonl = [
            json!({
                "requestId": "req-1",
                "timestamp": "2026-05-23T00:00:00.000Z",
                "message": { "usage": {
                    "input_tokens": 10,
                    "cache_creation_input_tokens": 20,
                    "cache_read_input_tokens": 70,
                    "output_tokens": 5
                }}
            })
            .to_string(),
            json!({
                "requestId": "req-1",
                "timestamp": "2026-05-23T00:00:01.000Z",
                "message": { "usage": {
                    "input_tokens": 10,
                    "cache_creation_input_tokens": 20,
                    "cache_read_input_tokens": 70,
                    "output_tokens": 5
                }}
            })
            .to_string(),
            json!({
                "requestId": "req-2",
                "timestamp": "2026-05-23T00:00:02.000Z",
                "message": { "usage": {
                    "input_tokens": 5,
                    "cache_creation_input_tokens": 0,
                    "cache_read_input_tokens": 45,
                    "output_tokens": 10
                }}
            })
            .to_string(),
        ]
        .join("\n");

        let usage = parse_claude_token_usage_from_jsonl(&jsonl);

        assert_eq!(usage.input, 150);
        assert_eq!(usage.cached_input, 115);
        assert_eq!(usage.output, 15);
        assert_eq!(usage.total, 165);
        assert_eq!(usage.cache_hit_rate, Some(115.0 / 150.0));
        assert_eq!(
            usage.updated_at.as_deref(),
            Some("2026-05-23T00:00:02.000Z")
        );
        assert_eq!(usage.source, TokenUsageSource::ClaudeJsonl);
        assert_eq!(usage.last_request.expect("last request").total, 60);
    }

    #[test]
    fn parses_codex_token_usage_from_latest_total() {
        let jsonl = [
            json!({
                "timestamp": "2026-05-23T00:00:00.000Z",
                "payload": {
                    "total_token_usage": {
                        "input_tokens": 100,
                        "cached_input_tokens": 60,
                        "output_tokens": 10,
                        "reasoning_output_tokens": 2,
                        "total_tokens": 110
                    },
                    "last_token_usage": {
                        "input_tokens": 100,
                        "cached_input_tokens": 60,
                        "output_tokens": 10,
                        "reasoning_output_tokens": 2,
                        "total_tokens": 110
                    }
                }
            })
            .to_string(),
            json!({
                "timestamp": "2026-05-23T00:00:05.000Z",
                "payload": {
                    "total_token_usage": {
                        "input_tokens": 250,
                        "cached_input_tokens": 200,
                        "output_tokens": 30,
                        "reasoning_output_tokens": 7,
                        "total_tokens": 280
                    },
                    "last_token_usage": {
                        "input_tokens": 150,
                        "cached_input_tokens": 140,
                        "output_tokens": 20,
                        "reasoning_output_tokens": 5,
                        "total_tokens": 170
                    }
                }
            })
            .to_string(),
        ]
        .join("\n");

        let usage = parse_codex_token_usage_from_jsonl(&jsonl);

        assert_eq!(usage.input, 250);
        assert_eq!(usage.cached_input, 200);
        assert_eq!(usage.output, 30);
        assert_eq!(usage.reasoning_output, 7);
        assert_eq!(usage.total, 280);
        assert_eq!(usage.cache_hit_rate, Some(0.8));
        assert_eq!(usage.last_request.expect("last request").total, 170);
        assert_eq!(
            usage.updated_at.as_deref(),
            Some("2026-05-23T00:00:05.000Z")
        );
        assert_eq!(usage.source, TokenUsageSource::CodexJsonl);
    }

    #[test]
    fn aggregates_token_usage_by_source() {
        let summary = aggregate_token_usage(vec![
            TokenUsage {
                input: 100,
                cached_input: 80,
                output: 10,
                reasoning_output: 0,
                total: 110,
                cache_hit_rate: Some(0.8),
                last_request: None,
                updated_at: None,
                source: TokenUsageSource::ClaudeJsonl,
            },
            TokenUsage {
                input: 300,
                cached_input: 150,
                output: 40,
                reasoning_output: 5,
                total: 340,
                cache_hit_rate: Some(0.5),
                last_request: None,
                updated_at: None,
                source: TokenUsageSource::CodexJsonl,
            },
            create_empty_token_usage(TokenUsageSource::None),
        ]);

        assert_eq!(summary.all.cache_hit_rate, Some(230.0 / 400.0));
        assert_eq!(summary.all.total, 450);
        assert_eq!(summary.claude.total, 110);
        assert_eq!(summary.codex.total, 340);
    }

    #[test]
    fn serializes_to_existing_renderer_contract() {
        let usage = TokenUsage {
            input: 10,
            cached_input: 5,
            output: 2,
            reasoning_output: 1,
            total: 12,
            cache_hit_rate: Some(0.5),
            last_request: None,
            updated_at: None,
            source: TokenUsageSource::CodexJsonl,
        };

        let value = serde_json::to_value(usage).expect("usage should serialize");

        assert_eq!(value["cachedInput"], 5);
        assert_eq!(value["reasoningOutput"], 1);
        assert_eq!(value["source"], "codex-jsonl");
        assert!(value.get("cached_input").is_none());
    }

    #[test]
    fn finds_codex_session_jsonl_by_session_id_or_cwd() {
        let home = temp_home();
        let archived = home.join(".codex").join("archived_sessions");
        create_dir_all(&archived).expect("archived dir should be created");
        let by_id = archived.join("2026-05-31-abcdef12.jsonl");
        write(&by_id, "{}\n").expect("session id file should be written");
        let by_cwd = archived.join("2026-05-31-other.jsonl");
        write(
            &by_cwd,
            json!({
                "type": "session_meta",
                "payload": { "cwd": "/repo" }
            })
            .to_string()
                + "\n",
        )
        .expect("cwd file should be written");

        assert_eq!(
            find_codex_session_jsonl(&home, "abcdef12", None),
            Some(by_id)
        );
        assert_eq!(
            find_codex_session_jsonl(&home, "", Some("/repo")),
            Some(by_cwd)
        );
        remove_dir_all(home).expect("test home should be removed");
    }

    #[test]
    fn summarizes_claude_and_codex_jsonl_files_from_home() {
        let home = temp_home();
        let claude_project = home.join(".claude").join("projects").join("-repo");
        let codex_archive = home.join(".codex").join("archived_sessions");
        create_dir_all(&claude_project).expect("claude project should be created");
        create_dir_all(&codex_archive).expect("codex archive should be created");
        write(
            claude_project.join("claude.jsonl"),
            json!({
                "requestId": "req-1",
                "message": { "usage": {
                    "input_tokens": 10,
                    "cache_creation_input_tokens": 0,
                    "cache_read_input_tokens": 5,
                    "output_tokens": 3
                }}
            })
            .to_string()
                + "\n",
        )
        .expect("claude usage should be written");
        write(
            codex_archive.join("codex.jsonl"),
            json!({
                "payload": {
                    "total_token_usage": {
                        "input_tokens": 20,
                        "cached_input_tokens": 10,
                        "output_tokens": 7,
                        "reasoning_output_tokens": 2,
                        "total_tokens": 27
                    }
                }
            })
            .to_string()
                + "\n",
        )
        .expect("codex usage should be written");

        let summary = get_token_usage_summary_from_home(&home);

        assert_eq!(summary.claude.total, 18);
        assert_eq!(summary.codex.total, 27);
        assert_eq!(summary.all.total, 45);
        remove_dir_all(home).expect("test home should be removed");
    }
}
