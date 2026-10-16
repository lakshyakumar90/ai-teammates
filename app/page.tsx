import type { CSSProperties } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { auth } from "@clerk/nextjs/server"
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  MessageCircle,
  Monitor,
  MousePointer2,
  ShieldCheck,
  Users,
} from "lucide-react"

import { ChatAvatar } from "@/components/chat-avatar"
import { LandingDemos } from "@/components/landing-demos"
import styles from "./landing.module.css"

export const metadata: Metadata = {
  title: "AI Teammates — A team of your own",
  description:
    "Meet your AI teammates. Give every bot a role, bring them together in group chats, and build a team that remembers how you work.",
}

const portraits = [
  {
    name: "Ada",
    role: "Research assistant",
    seed: "Ada",
    color: "#dce9d2",
    mobile: [18, 16],
  },
  {
    name: "Milo",
    role: "Writing partner",
    seed: "milo-writer",
    color: "#f1d7cc",
    mobile: [49, 9],
  },
  {
    name: "Cleo",
    role: "Code reviewer",
    seed: "codeee",
    color: "#dfdef0",
    mobile: [80, 17],
  },
  {
    name: "Noa",
    role: "Research partner",
    seed: "research-noa",
    color: "#f1e9be",
    mobile: [92, 28],
  },
  {
    name: "Bea",
    role: "Content editor",
    seed: "yoyo",
    color: "#d8e9ed",
    mobile: [81, 83],
  },
  {
    name: "Otto",
    role: "Code reviewer",
    seed: "otto-code",
    color: "#eadcd2",
    mobile: [50, 92],
  },
  {
    name: "Ivy",
    role: "Writing partner",
    seed: "ivy-writer",
    color: "#dbe2ce",
    mobile: [19, 83],
  },
  {
    name: "Finn",
    role: "Research assistant",
    seed: "finn",
    color: "#e9dbe4",
    mobile: [7, 28],
  },
  {
    name: "Luna",
    role: "Content editor",
    seed: "luna",
    color: "#e8dfca",
    mobile: [0, 0],
  },
  {
    name: "Remy",
    role: "Code reviewer",
    seed: "remy",
    color: "#d3e2ee",
    mobile: [0, 0],
  },
  {
    name: "Sage",
    role: "Research partner",
    seed: "sage",
    color: "#e1d7ec",
    mobile: [0, 0],
  },
  {
    name: "Kit",
    role: "Writing partner",
    seed: "kit",
    color: "#f0d9b9",
    mobile: [0, 0],
  },
]

function Brand() {
  return (
    <span className={styles.brand}>
      <span className={styles.brandMark} aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      AI Teammates
    </span>
  )
}

export default async function LandingPage() {
  const { isAuthenticated } = await auth()
  const destination = isAuthenticated ? "/dashboard" : "/sign-up"
  const action = isAuthenticated
    ? "Go to your dashboard"
    : "Make your first teammate"

  return (
    <div className={styles.landing} id="top">
      <a href="#main-content" className={styles.skipLink}>
        Skip to content
      </a>
      <header className={styles.header}>
        <Link href="/" aria-label="AI Teammates home">
          <Brand />
        </Link>
        <nav className={styles.navigation} aria-label="Main navigation">
          <a href="#work-together">Product</a>
          <a href="#memory">Memory</a>
          <a href="#your-team">Your team</a>
          <a href="#questions">Questions</a>
        </nav>
        <Link
          href={isAuthenticated ? "/dashboard" : "/sign-in"}
          className={styles.headerAction}
        >
          {isAuthenticated ? "Dashboard" : "Sign in"}
          <ArrowUpRight size={15} />
        </Link>
      </header>

      <main id="main-content">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.portraitOrbit}>
            {portraits.map((bot, i) => {
              const angle = ((-90 + i * 30) * Math.PI) / 180
              return (
                <a
                  href="#your-team"
                  key={bot.name}
                  className={styles.portrait}
                  aria-label={`Meet ${bot.name}, an example ${bot.role.toLowerCase()}`}
                  style={
                    {
                      "--x": `${50 + 40 * Math.cos(angle)}%`,
                      "--y": `${49 + 41 * Math.sin(angle)}%`,
                      "--mx": `${bot.mobile[0]}%`,
                      "--my": `${bot.mobile[1]}%`,
                      "--tile": bot.color,
                      "--tilt": `${i % 2 ? 5 : -5}deg`,
                      "--delay": `${i * 45}ms`,
                    } as CSSProperties
                  }
                >
                  <span className={styles.portraitTile}>
                    <ChatAvatar
                      seed={bot.seed}
                      className={styles.portraitFace}
                    />
                  </span>
                  <span className={styles.portraitCaption}>
                    {bot.name}
                    <small>{bot.role}</small>
                  </span>
                </a>
              )
            })}
          </div>
          <div className={styles.heroCopy}>
            <h1 id="hero-title">
              A little team.
              <br />A lot more possible.
            </h1>
            <p>
              AI teammates with their own roles,
              <br className={styles.desktopBreak} /> a shared conversation, and
              a memory for you.
            </p>
            <Link href={destination} className={styles.primaryAction}>
              {action}
              <ArrowUpRight size={17} />
            </Link>
            <span className={styles.heroNote}>
              Give them a name. Make them your team.
            </span>
          </div>
          <a className={styles.explore} href="#work-together">
            Meet a different way to work
            <ArrowDown size={14} />
          </a>
        </section>

        <section className={styles.introduction} id="work-together">
          <h2>
            Good at different things.
            <br />
            <span>Better together.</span>
          </h2>
          <p>
            A researcher to find the signal. A writer to find the words. A
            reviewer to catch what you missed. Create bots for the way you work,
            then bring the right minds into the same conversation.
          </p>
        </section>

        <section
          className={styles.collaboration}
          aria-labelledby="collaboration-title"
        >
          <div className={styles.sectionCopy}>
            <span className={styles.featureIcon}>
              <Users size={24} />
            </span>
            <h2 id="collaboration-title">
              Less switching.
              <br />
              More working together.
            </h2>
            <p>
              One conversation, different perspectives. Mention the teammate you
              need, or let a bot hand your request to the right specialist. The
              context comes along.
            </p>
            <Link href={destination} className={styles.textLink}>
              Bring your team together
              <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className={styles.conversationDemo}>
            <div className={styles.demoHeader}>
              <span className={styles.stackedAvatars}>
                <ChatAvatar seed="Ada" />
                <ChatAvatar seed="yoyo" />
                <ChatAvatar seed="codeee" />
              </span>
              <span>
                The launch crew<small>3 teammates, one conversation</small>
              </span>
              <MessageCircle size={18} />
            </div>
            <div className={styles.exampleLabel}>Example conversation</div>
            <div className={styles.userBubble}>
              <span>@Ada</span> Turn these research notes into a short launch
              announcement.
            </div>
            <div className={styles.botMessage}>
              <ChatAvatar seed="Ada" />
              <div>
                <strong>
                  Ada <small>Research assistant</small>
                </strong>
                <p>
                  Milo is the writer on our team. I’ll pass the notes over so he
                  can shape the announcement.
                </p>
                <div className={styles.handoff}>
                  <ArrowRight size={14} /> Handed off to Milo{" "}
                  <Check size={13} />
                </div>
              </div>
            </div>
            <div className={styles.botMessage}>
              <ChatAvatar seed="milo-writer" />
              <div>
                <strong>
                  Milo <small>Writing partner</small>
                </strong>
                <p>
                  Here’s a first draft that keeps the main finding up front and
                  gives readers a clear next step.
                </p>
                <div className={styles.draftNote}>
                  Meet your new launch crew.
                  <br />
                  <span>One place to research, write, and work together.</span>
                </div>
              </div>
            </div>
            <div className={styles.demoComposer}>
              Message a teammate, or type @ to mention one…
              <span>
                <ArrowUpRight size={16} />
              </span>
            </div>
          </div>
        </section>

        <LandingDemos destination={destination} />

        <section
          className={styles.computerSection}
          aria-labelledby="computer-title"
        >
          <div className={styles.computerDemo}>
            <div className={styles.computerBar}>
              <span className={styles.windowDots}>
                <i />
                <i />
                <i />
              </span>
              <span>Ada’s computer</span>
              <Monitor size={14} />
            </div>
            <div className={styles.computerWorkspace}>
              <div className={styles.document}>
                <div className={styles.documentTitle}>
                  Research, with a place to land.
                </div>
                <p>
                  Notes, drafts, and the details that move your work forward.
                </p>
                <span className={styles.documentLine} />
                <span className={styles.documentLine} />
                <span className={styles.documentLine} />
                <div className={styles.documentCheck}>
                  <Check size={15} /> Ready for your next conversation
                </div>
              </div>
              <div className={styles.fileNote}>
                <span className={styles.fileIcon}>md</span>
                <span>
                  research-notes.md<small>Inside Ada’s workspace</small>
                </span>
              </div>
              <span className={styles.cursor}>
                <MousePointer2 size={20} fill="currentColor" />
                <span>Ada</span>
              </span>
            </div>
            <div className={styles.computerBottom}>
              <span className={styles.statusDot} /> Individual workspace
              <span>Illustrative preview</span>
            </div>
          </div>
          <div className={styles.sectionCopy}>
            <span className={styles.featureIcon}>
              <Monitor size={24} />
            </span>
            <h2 id="computer-title">
              A teammate.
              <br />
              And a computer
              <br />
              of their own.
            </h2>
            <p>
              Every bot gets its own cloud workspace. In an individual chat,
              they can use files, run commands, and work with their browser.
              Open the desktop panel to see what’s happening.
            </p>
            <Link href={destination} className={styles.textLink}>
              Meet your first teammate
              <ArrowUpRight size={16} />
            </Link>
          </div>
        </section>

        <section
          className={styles.questions}
          id="questions"
          aria-labelledby="questions-title"
        >
          <div>
            <h2 id="questions-title">
              A few things
              <br />
              you might be wondering.
            </h2>
            <p>
              Different teammates.
              <br />
              One place to start.
            </p>
          </div>
          <div className={styles.questionList}>
            {[
              [
                "What makes a teammate my own?",
                "You choose their name, avatar, job, and instructions. Start with a researcher, writer, or code reviewer, or give a bot a role that fits your work.",
              ],
              [
                "Can I talk to more than one bot at a time?",
                "Yes. Create a group chat and choose the participating bots. Pick a responder from the dropdown or mention a bot by name. Bots can hand a task to a better-suited member.",
              ],
              [
                "What do my teammates remember?",
                "Useful personal facts and lasting preferences can be saved globally. Group-specific notes stay with the group, while individual context stays in the bot’s own memory. You can control saving and access in Memory & privacy.",
              ],
              [
                "Can I see my bot’s computer?",
                "Yes. Individual chats have a desktop panel for the bot’s cloud workspace. Group chats focus on the shared conversation and do not include a desktop panel.",
              ],
            ].map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className={styles.closing}>
          <div className={styles.closingFaces}>
            <ChatAvatar seed="Ada" />
            <ChatAvatar seed="milo-writer" />
            <ChatAvatar seed="codeee" />
          </div>
          <h2>
            Your next good idea
            <br />
            could use some company.
          </h2>
          <p>Start with one teammate. Build your kind of team.</p>
          <Link href={destination} className={styles.primaryAction}>
            {action}
            <ArrowUpRight size={17} />
          </Link>
          <span className={styles.closingNote}>
            <ShieldCheck size={14} /> Your team. Your context. Your memory
            settings.
          </span>
        </section>
      </main>
      <footer className={styles.footer}>
        <Link href="/" aria-label="AI Teammates home">
          <Brand />
        </Link>
        <span>A team of your own.</span>
        <a href="#top">
          Back to top
          <ArrowUpRight size={14} />
        </a>
        <span>© {new Date().getFullYear()} AI Teammates</span>
      </footer>
    </div>
  )
}
