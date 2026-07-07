import { invoke } from "@tauri-apps/api/core";
import type {
  AccountView,
  PresenceView,
  GameInfo,
  Settings,
  ServerPage,
  GameCard,
  PlaceCard,
  Outfit,
  Favorite,
  NexusStatus,
  Recent,
  VipLink,
  ClientVersion,
} from "./types";

export const api = {
  unlock: (password: string) =>
    invoke<AccountView[]>("unlock", { password }),

  listAccounts: () => invoke<AccountView[]>("list_accounts"),

  addAccount: (cookie: string) =>
    invoke<AccountView>("add_account", { cookie }),

  addAccountsBulk: (cookies: string[]) =>
    invoke<{ added: AccountView[]; failed: number }>("add_accounts_bulk", {
      cookies,
    }),

  openLoginWindow: () => invoke<void>("open_login_window"),
  checkLogin: () => invoke<AccountView | null>("check_login"),
  closeLoginWindow: () => invoke<void>("close_login_window"),

  removeAccount: (userId: number) =>
    invoke<void>("remove_account", { userId }),

  updateAccount: (
    userId: number,
    fields: { alias?: string; description?: string; group?: string }
  ) => invoke<AccountView>("update_account", { userId, ...fields }),

  getRobux: (userId: number) => invoke<number>("get_robux", { userId }),

  getPresences: () => invoke<PresenceView[]>("get_presences"),

  getThumbnails: () =>
    invoke<{ user_id: number; image_url: string }[]>("get_thumbnails"),

  getGameInfo: (placeId: number) =>
    invoke<GameInfo>("get_game_info", { placeId }),

  launchGame: (userId: number, placeId: number, jobId: string) =>
    invoke<string>("launch_game", { userId, placeId, jobId }),

  revealCookie: (userId: number) =>
    invoke<string>("reveal_cookie", { userId }),

  setPassword: (newPassword: string) =>
    invoke<void>("set_password", { newPassword }),

  // account org
  saveLaunch: (userId: number, placeId: number | null, jobId: string) =>
    invoke<AccountView>("save_launch", { userId, placeId, jobId }),
  setAutoRelaunch: (userId: number, enabled: boolean) =>
    invoke<AccountView>("set_auto_relaunch", { userId, enabled }),
  reorderAccounts: (orderedIds: number[]) =>
    invoke<void>("reorder_accounts", { orderedIds }),
  revealPassword: (userId: number) =>
    invoke<string>("reveal_password", { userId }),
  setAccountPassword: (userId: number, password: string) =>
    invoke<AccountView>("set_account_password", { userId, password }),
  getRecents: () => invoke<Recent[]>("get_recents"),
  addRecent: (placeId: number, name: string) =>
    invoke<Recent[]>("add_recent", { placeId, name }),
  parseVipLink: (input: string) =>
    invoke<VipLink | null>("parse_vip_link", { input }),

  // account actions
  setDisplayName: (userId: number, name: string) =>
    invoke<void>("set_display_name", { userId, name }),
  setFollowPrivacy: (userId: number, privacy: string) =>
    invoke<void>("set_follow_privacy", { userId, privacy }),
  changePassword: (userId: number, current: string, next: string) =>
    invoke<void>("change_password", { userId, current, new: next }),
  changeEmail: (userId: number, password: string, email: string) =>
    invoke<void>("change_email", { userId, password, email }),
  quickLogin: (userId: number, code: string) =>
    invoke<void>("quick_login", { userId, code }),

  getSettings: () => invoke<Settings>("get_settings"),
  saveSettings: (settings: Settings) =>
    invoke<Settings>("save_settings", { new: settings }),

  // utilities
  followUser: (userId: number, username: string) =>
    invoke<string>("follow_user", { userId, username }),
  listServers: (placeId: number, cursor: string) =>
    invoke<ServerPage>("list_servers", { placeId, cursor }),
  browseGames: (keyword: string) =>
    invoke<GameCard[]>("browse_games", { keyword }),
  getUniverseId: (placeId: number) =>
    invoke<number>("get_universe_id", { placeId }),
  getUniversePlaces: (universeId: number) =>
    invoke<PlaceCard[]>("get_universe_places", { universeId }),
  listOutfits: (username: string) =>
    invoke<Outfit[]>("list_outfits", { username }),
  wearOutfit: (userId: number, outfitId: number) =>
    invoke<void>("wear_outfit", { userId, outfitId }),
  getFavorites: () => invoke<Favorite[]>("get_favorites"),
  addFavorite: (placeId: number, name: string, jobId: string) =>
    invoke<Favorite[]>("add_favorite", { placeId, name, jobId }),
  removeFavorite: (placeId: number) =>
    invoke<Favorite[]>("remove_favorite", { placeId }),

  // nexus
  nexusStatus: () => invoke<NexusStatus>("nexus_status"),
  nexusStart: (port: number) => invoke<void>("nexus_start", { port }),
  nexusStop: () => invoke<void>("nexus_stop"),
  nexusExecute: (targets: string[], script: string) =>
    invoke<number>("nexus_execute", { targets, script }),
  nexusTeleport: (targets: string[], placeId: number, jobId: string) =>
    invoke<number>("nexus_teleport", { targets, placeId, jobId }),
  nexusCommand: (targets: string[], message: string) =>
    invoke<number>("nexus_command", { targets, message }),
  nexusLua: () => invoke<string>("nexus_lua"),

  // deployments / version control
  getClientVersion: (binaryType: string, channel: string) =>
    invoke<ClientVersion>("get_client_version", { binaryType, channel }),
  downloadDeployment: (
    channel: string,
    binaryType: string,
    arch: string,
    version: string,
    compress: boolean
  ) =>
    invoke<string>("download_deployment", {
      channel,
      binaryType,
      arch,
      version,
      compress,
    }),
};
