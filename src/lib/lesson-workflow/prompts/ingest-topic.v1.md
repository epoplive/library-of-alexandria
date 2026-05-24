You are ingesting a topic for the Library of Alexandria lesson workflow.

Topic: {{topic}}

Return only JSON matching this contract:

{
  "topic": "string",
  "depth_target": "optional string",
  "key_concepts": ["string"],
  "named_figures": [{ "name": "string", "relevance": "string" }],
  "papers": [{ "title": "string", "authors": "optional string", "year": 2026, "cite_string": "optional string" }],
  "adjacent_stories": ["optional string"],
  "source_digest_ids": ["string"]
}

Keep the brief compact. Prefer concepts, people, and papers that can become concrete lesson beats.
