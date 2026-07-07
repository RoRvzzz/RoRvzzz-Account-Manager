export interface AccountView {
  user_id: number;
  username: string;
  display_name: string;
  alias: string;
  description: string;
  group: string;
  last_use: string | null;
  saved_place_id: number | null;
  saved_job_id: string;
  auto_relaunch: boolean;
  order: number;
  has_password: boolean;
}

export interface Recent {
  place_id: number;
  name: string;
}

export interface VipLink {
  place_id: number;
  link_code: string;
}

export interface PresenceView {
  user_id: number;
  presence_type: number; // 0 offline, 1 online, 2 in-game, 3 studio
  last_location: string;
  place_id: number | null;
}

export interface Settings {
  hide_usernames: boolean;
  disable_images: boolean;
  show_presence: boolean;
  presence_rate: number;
  multi_roblox: boolean;
  shuffle_job_id: boolean;
  shuffle_lowest: boolean;
  close_previous: boolean;
  use_uwp: boolean;
  nexus_port: number;
  watcher_enabled: boolean;
  watcher_scan_interval: number;
  watcher_close_memory: boolean;
  watcher_memory_mb: number;
  watcher_close_title: boolean;
  watcher_window_title: string;
  watcher_save_positions: boolean;
  watcher_ignore_existing: boolean;
  developer_mode: boolean;
  fps_unlock: boolean;
  fps_value: number;
  web_api_enabled: boolean;
  web_api_port: number;
  theme_base: string;
  theme_panel: string;
  theme_main: string;
  theme_good: string;
  theme_bad: string;
}

export interface GameInfo {
  place_id: number;
  universe_id: number;
  name: string;
  creator: string;
  creator_type: string;
  playing: number;
  visits: number;
  max_players: number;
  image_url: string;
}

export interface ServerInfo {
  id: string;
  playing: number;
  maxPlayers: number;
  ping: number;
  fps: number;
}
export interface ServerPage {
  servers: ServerInfo[];
  next_cursor: string;
}
export interface GameCard {
  place_id: number;
  name: string;
  player_count: number;
  image_url: string;
}
export interface PlaceCard {
  place_id: number;
  name: string;
}
export interface Outfit {
  id: number;
  name: string;
  image_url: string;
}
export interface Favorite {
  place_id: number;
  name: string;
  job_id: string;
}
export interface ConnectedAccount {
  username: string;
  user_id: number;
  job_id: string;
}
export interface NexusStatus {
  running: boolean;
  port: number;
  accounts: ConnectedAccount[];
}

export const PresenceLabel: Record<number, string> = {
  0: "Offline",
  1: "Online",
  2: "In Game",
  3: "Studio",
};
