import Image from "next/image"
import { Avatar, Style } from "@dicebear/core"
import definition from "@dicebear/styles/gaze.json" with { type: "json" }

const style = new Style(definition)

type ChatAvatarProps = {
  seed: string
  animated?: boolean
  className?: string
}

export function ChatAvatar({ seed, animated, className }: ChatAvatarProps) {
  const dataUri = new Avatar(style, {
    seed,
    size: 32,
    ...(animated ? { tags: ["animation"] } : {}),
  }).toDataUri()

  return (
    <Image
      src={dataUri}
      alt={`Avatar for ${seed}`}
      width={32}
      height={32}
      unoptimized
      className={className}
    />
  )
}
