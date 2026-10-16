type MentionBot = { id: string; name: string }

export function getMentionQuery(text: string, caret: number) {
  const match = /(?:^|\s)@([^\s@]*)$/.exec(text.slice(0, caret))
  return match
    ? { start: caret - match[1].length - 1, end: caret, query: match[1] }
    : undefined
}

export function resolveBotMention<T extends MentionBot>(
  text: string,
  bots: T[],
  selectedId?: string
) {
  const matches = bots
    .flatMap((bot) => {
      const escaped = bot.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      const match = new RegExp(`(^|\\s)@${escaped}(?=\\s|$|[,:;!?])`, "i").exec(
        text
      )
      return match
        ? [
            {
              bot,
              start: match.index + match[1].length,
              length: bot.name.length + 1,
            },
          ]
        : []
    })
    .sort(
      (a, b) =>
        a.start - b.start ||
        b.length - a.length ||
        Number(b.bot.id === selectedId) - Number(a.bot.id === selectedId)
    )
  const mention = matches[0]
  return {
    bot: mention?.bot ?? bots.find((bot) => bot.id === selectedId) ?? bots[0],
    text: mention
      ? `${text.slice(0, mention.start)}${text.slice(mention.start + mention.length)}`.trim()
      : text.trim(),
    mention,
  }
}
