import { defineStore } from "pinia";
import { FetchStatus } from "./useFetchStatus";
import { Chart } from "@prisma/client";

export enum PrivacySetting {
  PUBLIC = "PUBLIC",
  PRIVATE = "PRIVATE",
  FRIENDS_ONLY = "FRIENDS_ONLY",
  PERSONAL = "PERSONAL",
}

export type User = {
  location: string | null;
  user_id: string;
  username: string;
  display_name: string;
  avatar: string | null;
  pronouns: string | null;
  bio: string;
  privacy: PrivacySetting;
  charts: Chart[];
  bgg_username: string | null;
  enable_bgstats: boolean;
};

export const useUsers = defineStore("users", {
  state: () => ({
    users: new Map<string, FetchStatus<User>>(),
  }),
  getters: {
    getUser(): (username: string) => FetchStatus<User> {
      return (username: string) => {
        return this.users.get(username) || { status: Status.IDLE };
      };
    },
    getUserById(): (user_id?: string) => FetchStatus<User> {
      return (user_id?: string) => {
        for (const user of this.users.values()) {
          if (user.status === Status.SUCCESS && user.data.user_id === user_id)
            return user;
        }

        return { status: Status.IDLE };
      };
    },
  },
  actions: {
    async fetchUser(username: string) {
      // Mark as loading if we don't have the user yet
      if (!this.users.has(username))
        this.users.set(username, { status: Status.LOADING });

      // Fetch the user
      const user = await $fetch<User>(`/api/user/${username}`);

      // Otherwise, mark as success
      this.storeUser(user);
    },
    storeUser(user: User) {
      this.users.set(user.username, { status: Status.SUCCESS, data: user });
    },
    async fetchMe(user_id?: string) {
      if (!user_id) return;
      const games = useGames();
      const me = await $fetch<User>("/api/settings");
      games.fetchPlayerGames(me.username);

      this.storeUser(me);
    },
  },
});
