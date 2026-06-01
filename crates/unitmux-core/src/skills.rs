use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SkillEntry {
    pub name: String,
    pub description: String,
}

pub fn list_skills_from_dir(base_dir: impl AsRef<Path>) -> Vec<SkillEntry> {
    let skills_dir = base_dir.as_ref().join(".claude").join("skills");
    let Ok(entries) = fs::read_dir(skills_dir) else {
        return Vec::new();
    };

    let mut skills = Vec::new();
    for entry in entries.flatten() {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_dir() {
            continue;
        }
        let content_path = entry.path().join("SKILL.md");
        let Ok(content) = fs::read_to_string(content_path) else {
            continue;
        };
        if let Some(skill) = parse_skill_frontmatter(&content) {
            skills.push(skill);
        }
    }
    skills
}

fn parse_skill_frontmatter(content: &str) -> Option<SkillEntry> {
    let rest = content.strip_prefix("---\n")?;
    let (frontmatter, _) = rest.split_once("\n---")?;
    let mut name = None;
    let mut description = String::new();

    for line in frontmatter.lines() {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        match key.trim() {
            "name" => name = Some(value.trim().to_string()),
            "description" => description = value.trim().to_string(),
            _ => {}
        }
    }

    name.map(|name| SkillEntry { name, description })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{create_dir_all, remove_dir_all, write};
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn reads_skill_frontmatter_from_claude_skills_directory() {
        let root = std::env::temp_dir().join(format!(
            "unitmux-skills-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock should be after epoch")
                .as_nanos()
        ));
        let skill_dir = root.join(".claude").join("skills").join("example");
        create_dir_all(&skill_dir).expect("test skill dir should be created");
        write(
            skill_dir.join("SKILL.md"),
            "---\nname: example\nx: ignored\ndescription: Does useful work\n---\nbody\n",
        )
        .expect("test skill file should be written");

        let result = list_skills_from_dir(&root);

        assert_eq!(
            result,
            vec![SkillEntry {
                name: "example".to_string(),
                description: "Does useful work".to_string(),
            }]
        );
        remove_dir_all(root).expect("test dir should be removed");
    }
}
