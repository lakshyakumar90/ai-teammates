"use client"

import { useState } from "react"
import Link from "next/link"
import {
  ArrowUpRight,
  Brain,
  Check,
  Globe2,
  LockKeyhole,
  Users,
} from "lucide-react"
import { ChatAvatar } from "@/components/chat-avatar"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import styles from "@/app/landing.module.css"

const memories = {
  global: {
    title: "A little more you.",
    detail:
      "Personal facts and lasting preferences, available across your authorized chats.",
    icon: Globe2,
    notes: [
      "Your dog’s name is Mochi",
      "Your preferred writing tone is friendly",
      "You prefer clear, concise answers",
    ],
    footer: "Shared across your teammates",
  },
  group: {
    title: "Everyone on the same page.",
    detail:
      "Project details and decisions that belong to this group, remembered by its members.",
    icon: Users,
    notes: [
      "This group’s project is Copper Finch",
      "The launch draft uses a friendly tone",
      "Keep the group’s research notes together",
    ],
    footer: "Available to this group’s members",
  },
  bot: {
    title: "A context of their own.",
    detail:
      "Individual working notes that stay with the bot, with group access controlled by you.",
    icon: LockKeyhole,
    notes: [
      "Ada is working on the research brief",
      "Keep this draft’s working notes private",
      "Pick up from the last review",
    ],
    footer: "Kept in the bot’s own memory",
  },
}
const teammates = [
  {
    id: "research",
    name: "Ada",
    role: "Research assistant",
    seed: "Ada",
    color: "#e3ebda",
    title: "Find the signal in the noise.",
    description:
      "Give your researcher a question, a brief, or a topic to investigate. Work through ideas, compare perspectives, and turn notes into clear findings.",
    prompt: "Help me compare these approaches.",
    reply:
      "Let’s look at the trade-offs, the evidence, and what matters most for your decision.",
  },
  {
    id: "writing",
    name: "Milo",
    role: "Writing partner",
    seed: "milo-writer",
    color: "#f0dfd6",
    title: "Find the words you were looking for.",
    description:
      "Bring a rough idea, a first draft, or a pile of research. Give your writer the tone and audience, then shape the words together.",
    prompt: "Make this draft sound more like me.",
    reply:
      "I’ll keep your point of view, tighten the structure, and make the language feel natural.",
  },
  {
    id: "code",
    name: "Cleo",
    role: "Code reviewer",
    seed: "codeee",
    color: "#e5e1f0",
    title: "A second pair of eyes for your code.",
    description:
      "Talk through an implementation, review a tricky function, or ask for a clearer explanation. Keep the feedback focused on the code in front of you.",
    prompt: "Review this function before I ship it.",
    reply:
      "I’ll check the logic, edge cases, and readability, then suggest the changes that matter.",
  },
]

export function LandingDemos({ destination }: { destination: string }) {
  const [scope, setScope] = useState<keyof typeof memories>("global")
  const [selected, setSelected] = useState("research")
  const memory = memories[scope]
  const teammate = teammates.find(({ id }) => id === selected)!
  const Icon = memory.icon
  return (
    <>
      <section
        id="memory"
        className={styles.memorySection}
        aria-labelledby="memory-title"
      >
        <div className={styles.sectionCopy}>
          <span className={styles.featureIcon}>
            <Brain size={24} />
          </span>
          <h2 id="memory-title">
            Remember the details.
            <br />
            Keep the boundaries.
          </h2>
          <p>
            Your preferences shouldn’t need another introduction. Useful
            information finds the right home: shared across your team, kept
            within a group, or remembered by one bot.
          </p>
          <Link href={destination} className={styles.textLink}>
            Make it your kind of team
            <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className={styles.memoryDemo}>
          <div className={styles.exampleLabel}>
            Explore the memory levels · illustrative notes
          </div>
          <ToggleGroup
            className={styles.demoToggle}
            value={[scope]}
            onValueChange={(values) => {
              if (values[0]) setScope(values[0] as keyof typeof memories)
            }}
            aria-label="Explore memory scope"
          >
            <ToggleGroupItem value="global">Global</ToggleGroupItem>
            <ToggleGroupItem value="group">Group</ToggleGroupItem>
            <ToggleGroupItem value="bot">Individual</ToggleGroupItem>
          </ToggleGroup>
          <div className={styles.memoryContents} aria-live="polite">
            <Icon size={28} />
            <h3>{memory.title}</h3>
            <p>{memory.detail}</p>
            <ul>
              {memory.notes.map((note) => (
                <li key={note}>
                  <Check size={15} />
                  {note}
                </li>
              ))}
            </ul>
            <span className={styles.memoryFootnote}>
              <Icon size={13} />
              {memory.footer}
            </span>
          </div>
        </div>
      </section>
      <section
        id="your-team"
        className={styles.teamSection}
        aria-labelledby="team-title"
      >
        <div className={styles.teamHeading}>
          <h2 id="team-title">
            Different strengths.
            <br />
            Your kind of people.
          </h2>
          <p>
            Give each bot a job and a personality.
            <br />
            Here are a few places to start.
          </p>
        </div>
        <ToggleGroup
          className={styles.teamToggle}
          value={[selected]}
          onValueChange={(values) => {
            if (values[0]) setSelected(String(values[0]))
          }}
          aria-label="Explore example teammates"
        >
          {teammates.map((bot) => (
            <ToggleGroupItem key={bot.id} value={bot.id}>
              <ChatAvatar seed={bot.seed} />
              {bot.role}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div
          className={styles.teamSpotlight}
          style={{ backgroundColor: teammate.color }}
          aria-live="polite"
        >
          <div className={styles.teammatePortrait}>
            <ChatAvatar seed={teammate.seed} className={styles.largeFace} />
            <span>
              {teammate.name}
              <small>{teammate.role}</small>
            </span>
          </div>
          <div className={styles.teammateDescription}>
            <h3>{teammate.title}</h3>
            <p>{teammate.description}</p>
            <div className={styles.samplePrompt}>
              <span>Example conversation</span>
              <p>{teammate.prompt}</p>
              <p>
                <ChatAvatar seed={teammate.seed} />
                {teammate.reply}
              </p>
            </div>
            <Link href={destination} className={styles.textLink}>
              Create your own teammate
              <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
