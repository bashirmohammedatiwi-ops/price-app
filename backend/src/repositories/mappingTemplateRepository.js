function createMappingTemplateRepository(db) {
  const selectStmt = db.prepare(`
    SELECT source_name, mapping_json
    FROM mapping_templates
    WHERE source_name = @source_name
  `);

  const listStmt = db.prepare(`
    SELECT source_name, mapping_json
    FROM mapping_templates
    ORDER BY source_name ASC
  `);

  const upsertStmt = db.prepare(`
    INSERT INTO mapping_templates (source_name, mapping_json, created_at, updated_at)
    VALUES (@source_name, @mapping_json, datetime('now'), datetime('now'))
    ON CONFLICT(source_name) DO UPDATE SET
      mapping_json = excluded.mapping_json,
      updated_at = datetime('now')
  `);

  function getBySourceName({ source_name }) {
    const row = selectStmt.get({ source_name });
    if (!row) return null;
    try {
      return { source_name: row.source_name, mapping: JSON.parse(row.mapping_json) };
    } catch {
      return { source_name: row.source_name, mapping: {} };
    }
  }

  function listAll() {
    const rows = listStmt.all();
    return rows.map((row) => {
      try {
        return { source_name: row.source_name, mapping: JSON.parse(row.mapping_json) };
      } catch {
        return { source_name: row.source_name, mapping: {} };
      }
    });
  }

  function upsertTemplate({ source_name, mapping }) {
    upsertStmt.run({
      source_name,
      mapping_json: JSON.stringify(mapping ?? {}),
    });
  }

  return { getBySourceName, upsertTemplate, listAll };
}

module.exports = { createMappingTemplateRepository };

