-- Semantic search: pgvector column + cosine-similarity match RPC.
-- gte-small produces 384-dimensional, normalized embeddings.

create extension if not exists vector;

alter table songs add column if not exists embedding vector(384);

-- HNSW index for cosine distance. Not required at current scale (a sequential
-- scan over a few hundred rows is fast), but cheap to add now and avoids a
-- later migration as the library grows.
create index if not exists songs_embedding_idx
  on songs using hnsw (embedding vector_cosine_ops);

-- Returns the songs most similar to query_embedding, above match_threshold,
-- ordered most-similar first, capped at match_count. Returns id + similarity
-- only (no song content) so it leaks nothing past RLS; the client maps the ids
-- back onto its own RLS-filtered song list.
create or replace function match_songs(
  query_embedding vector(384),
  match_threshold float,
  match_count int
)
returns table (id uuid, similarity float)
language sql
stable
as $$
  select s.id, 1 - (s.embedding <=> query_embedding) as similarity
  from songs s
  where s.embedding is not null
    and 1 - (s.embedding <=> query_embedding) >= match_threshold
  order by s.embedding <=> query_embedding
  limit match_count;
$$;
