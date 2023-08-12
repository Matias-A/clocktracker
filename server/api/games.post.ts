import type { User } from "@supabase/supabase-js";
import {
  PrismaClient,
  Game,
  Character,
  Token,
  Grimoire,
  Alignment,
} from "@prisma/client";

const prisma = new PrismaClient();

export default defineEventHandler(async (handler) => {
  const user: User | null = handler.context.user;
  const body = await readBody<
    | (Game & {
        player_characters: (Character & { role?: { token_url: string } })[];
        grimoire: Partial<Grimoire & { tokens: Partial<Token>[] }>[];
      })
    | null
  >(handler);

  if (!user) {
    throw createError({
      status: 401,
      statusMessage: "Unauthorized",
    });
  }

  if (!body) {
    throw createError({
      status: 400,
      statusMessage: "Bad Request",
    });
  }

  const newGame = await prisma.game.create({
    data: {
      ...body,
      date: new Date(body.date),
      user_id: user.id,
      player_characters: {
        create: [...body.player_characters],
      },
      grimoire: {
        create: [
          ...body.grimoire.map((g) => ({
            ...g,
            tokens: {
              create: g.tokens?.map((token, index) => ({
                role_id: token.role_id,
                related_role_id: token.related_role_id,
                alignment: token.alignment || Alignment.NEUTRAL,
                is_dead: token.is_dead || false,
                order: token.order || index,
                player_name: token.player_name || "",
                player_id: token.player_id,
              })),
            },
          })),
        ],
      },
    },
    include: {
      player_characters: true,
      grimoire: {
        include: {
          tokens: {
            include: {
              role: true,
              related_role: true,
            },
          },
        },
      },
    },
  });

  const parentGameLastAlignment =
    newGame.player_characters[newGame.player_characters.length - 1].alignment;

  const taggedPlayers = new Set(
    newGame.grimoire.flatMap((g) => g.tokens?.map((t) => t.player_id))
  );

  for (const id of taggedPlayers) {
    if (!id || id === user.id) continue;

    // Reduce grimoire to find all tokens that have this player_id
    const player_characters = newGame.grimoire.reduce((acc, g) => {
      const tokens = g.tokens?.filter((t) => t.player_id === id);
      if (tokens) {
        for (const token of tokens) {
          // Don't add the token if it's identical to the last token
          // in the player_characters array

          const lastToken = acc[acc.length - 1];
          if (
            lastToken &&
            lastToken.role_id === token.role_id &&
            lastToken.related_role_id === token.related_role_id
          ) {
            continue;
          }

          acc.push({
            name: token.role?.name || "",
            alignment: token.alignment,
            related: token.related_role?.name || "",
            role_id: token.role_id,
            related_role_id: token.related_role_id,
          });
        }
      }

      return acc;
    }, [] as { name: string; alignment: Alignment; related: string; role_id: string | null; related_role_id: string | null }[]);

    const lastAlignment =
      player_characters[player_characters.length - 1].alignment;

    await prisma.game.create({
      data: {
        ...body,
        date: new Date(body.date),
        user_id: id,
        player_characters: {
          create: [...player_characters],
        },
        notes: "",
        win:
          lastAlignment === parentGameLastAlignment
            ? newGame.win
            : !newGame.win,
        // map the already created grimoires to the new game
        grimoire: {
          connect: newGame.grimoire.map((g) => ({ id: g.id })),
        },
        is_grimoire_protected: true,
        parent_game_id: newGame.id,
      },
    });
  }

  return newGame;
});
