import Dexie from "dexie";
import { dexieCloud } from "dexie-cloud-addon";

// ─── Database Definition ───────────────────────────────────────────────────
export const db = new Dexie("ChordVault");

dexieCloud(db);

db.version(1).stores({
  songs:
    "++id, title, artist, original_key, created_at, updated_at, last_played_at, *tags",
  setlists: "++id, name, created_at, updated_at",
  setlist_songs: "++id, setlist_id, song_id, position",
  sync_queue:
    "++id, operation, table_name, record_id, payload, created_at, synced",
  app_state: "key",
});

db.version(2).stores({
  songs:
    "id, title, artist, original_key, created_at, updated_at, last_played_at, *tags",
  setlists: "id, name, created_at, updated_at",
  setlist_songs: "id, setlist_id, song_id, position",
  sync_queue:
    "++id, operation, table_name, record_id, payload, created_at, synced",
  app_state: "key",
});

// ─── Dexie Cloud Configuration ─────────────────────────────────────────────
const dexieCloudUrl =
  typeof import.meta !== "undefined"
    ? import.meta.env?.VITE_DEXIE_CLOUD_URL
    : undefined;
const dexieCloudEnabled =
  typeof import.meta !== "undefined"
    ? import.meta.env?.VITE_DEXIE_CLOUD_ENABLED === "true"
    : false;

if (dexieCloudUrl && dexieCloudEnabled && db.cloud?.configure) {
  try {
    db.cloud.configure({
      databaseUrl: dexieCloudUrl,
      requireAuth: true,
      customLoginGui: false,
      syncedTables: ["songs", "setlists", "setlist_songs"],
      unsyncedTables: ["sync_queue", "app_state"],
    });
  } catch (error) {
    console.warn("Dexie Cloud configuration failed:", error);
  }
}

// ─── Song Operations ───────────────────────────────────────────────────────
export const songOps = {
  async getAll() {
    return db.songs.orderBy("title").toArray();
  },

  async getById(id) {
    return db.songs.get(id);
  },

  async create(songData) {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await db.songs.add({
      id,
      ...songData,
      created_at: now,
      updated_at: now,
      last_played_at: null,
      play_count: 0,
    });
    return db.songs.get(id);
  },

  async update(id, updates) {
    const now = new Date().toISOString();
    await db.songs.update(id, { ...updates, updated_at: now });
    return db.songs.get(id);
  },

  async delete(id) {
    // Also remove from all setlists
    await db.setlist_songs.where("song_id").equals(id).delete();
    await db.songs.delete(id);
  },

  async markPlayed(id) {
    const now = new Date().toISOString();
    const song = await db.songs.get(id);
    await db.songs.update(id, {
      last_played_at: now,
      play_count: (song?.play_count || 0) + 1,
    });
  },

  async search(query) {
    if (!query?.trim()) return this.getAll();
    const q = query.toLowerCase();
    return db.songs
      .filter(
        (song) =>
          song.title?.toLowerCase().includes(q) ||
          song.artist?.toLowerCase().includes(q) ||
          song.tags?.some((t) => t.toLowerCase().includes(q)),
      )
      .toArray();
  },

  async getByTag(tag) {
    return db.songs.where("tags").equals(tag).toArray();
  },
};

// ─── Setlist Operations ────────────────────────────────────────────────────
export const setlistOps = {
  async getAll() {
    return db.setlists.orderBy("created_at").reverse().toArray();
  },

  async getById(id) {
    return db.setlists.get(id);
  },

  async getWithSongs(id) {
    const setlist = await db.setlists.get(id);
    if (!setlist) return null;

    const slots = await db.setlist_songs
      .where("setlist_id")
      .equals(id)
      .sortBy("position");

    const songs = await Promise.all(
      slots.map(async (slot) => {
        const song = await db.songs.get(slot.song_id);
        return { ...slot, song };
      }),
    );

    return { ...setlist, songs };
  },

  async create(name) {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await db.setlists.add({
      id,
      name,
      created_at: now,
      updated_at: now,
    });
    return db.setlists.get(id);
  },

  async update(id, updates) {
    const now = new Date().toISOString();
    await db.setlists.update(id, { ...updates, updated_at: now });
    return db.setlists.get(id);
  },

  async delete(id) {
    await db.setlist_songs.where("setlist_id").equals(id).delete();
    await db.setlists.delete(id);
  },

  async addSong(setlistId, songId, chosenKey = null, capo = 0) {
    const existing = await db.setlist_songs
      .where("setlist_id")
      .equals(setlistId)
      .toArray();
    const position = existing.length;
    const id = crypto.randomUUID();
    await db.setlist_songs.add({
      id,
      setlist_id: setlistId,
      song_id: songId,
      position,
      chosen_key: chosenKey,
      capo: capo,
    });
    return db.setlist_songs.get(id);
  },

  async removeSong(setlistSongId) {
    await db.setlist_songs.delete(setlistSongId);
  },

  async updateSongSlot(setlistSongId, updates) {
    await db.setlist_songs.update(setlistSongId, updates);
  },

  async reorderSongs(setlistId, orderedSlotIds) {
    await db.transaction("rw", db.setlist_songs, async () => {
      for (let i = 0; i < orderedSlotIds.length; i++) {
        await db.setlist_songs.update(orderedSlotIds[i], { position: i });
      }
    });
  },
};

// ─── App State ─────────────────────────────────────────────────────────────
export const appStateOps = {
  async get(key) {
    const record = await db.app_state.get(key);
    return record?.value;
  },

  async set(key, value) {
    await db.app_state.put({ key, value });
  },
};

// ─── Sync Queue (for future Dexie Cloud integration) ───────────────────────
export const syncQueueOps = {
  async enqueue(operation, tableName, recordId, payload) {
    await db.sync_queue.add({
      operation,
      table_name: tableName,
      record_id: recordId,
      payload,
      created_at: new Date().toISOString(),
      synced: false,
    });
  },

  async getPending() {
    return db.sync_queue.where("synced").equals(0).toArray();
  },

  async markSynced(id) {
    await db.sync_queue.update(id, { synced: true });
  },
};

export default db;
