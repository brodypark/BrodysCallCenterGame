import { type ReactElement, useState } from "react";
import { cx } from "@client/ui/classNames";
import styles from "@client/ui/TitleMenu.module.css";
import docStyles from "@client/ui/GameManual.module.css";

export function GameManual({ onClose }: { onClose: () => void }): ReactElement {
  const [activeTab, setActiveTab] = useState<"story" | "gameplay" | "characters" | "economy">("story");

  return (
    <div className={styles.settingsModal}>
      <div className={cx(styles.settingsModalContent, docStyles.manualContent)}>
        <button type="button" className={styles.closeButton} onClick={onClose}>
          X
        </button>
        <h2 style={{ marginTop: 0, textAlign: "center" }}>Trust Me Bro: The Official Manual</h2>
        
        <div className={docStyles.tabs}>
          <button 
            className={cx(docStyles.tab, activeTab === "story" && docStyles.activeTab)} 
            onClick={() => setActiveTab("story")}
          >
            Story & Lore
          </button>
          <button 
            className={cx(docStyles.tab, activeTab === "gameplay" && docStyles.activeTab)} 
            onClick={() => setActiveTab("gameplay")}
          >
            Gameplay & Mechanics
          </button>
          <button 
            className={cx(docStyles.tab, activeTab === "characters" && docStyles.activeTab)} 
            onClick={() => setActiveTab("characters")}
          >
            Characters Profile
          </button>
          <button 
            className={cx(docStyles.tab, activeTab === "economy" && docStyles.activeTab)} 
            onClick={() => setActiveTab("economy")}
          >
            Economy & Shop
          </button>
        </div>

        <div className={docStyles.scrollArea}>
          {activeTab === "story" && (
            <div>
              <h3>How You Got Here</h3>
              <p>It was a Tuesday afternoon. The fluorescent lights of your cubicle at Initech Corp hummed their usual migraine-inducing tune. You were on hour six of debugging a legacy codebase written entirely in COBOL when your manager, Dave, tapped you on the shoulder. "We're restructuring," he said, holding a cardboard box. Just like that, you were fired. No severance, no warning, just a swift kick out the door into the pouring rain.</p>
              
              <p>For weeks, you scoured the internet for jobs. Every application ended in silence. Desperate and down to your last packet of instant ramen, you stumbled onto a bizarre listing on a sketchy dark-web forum: <em>"URGENT: Customer Service Reps Needed. High Risk, High Reward. Ask for Brody."</em></p>

              <p>You clicked the link, and suddenly your screen was hijacked. A retro 90s desktop interface booted up, and an email popped into your new inbox. It was Brody. He explained that this wasn't a normal help desk—this was the nerve center of a massive, highly coordinated underground operation.</p>

              <h3>Welcome to Brody's Call Center</h3>
              <p>Brody's operation disguises itself as a legitimate tech support and gift card help line. Unsuspecting people from all walks of life—grandmas, gamers, gym bros, and even super-villains—call in seeking help with their gift cards and technical issues.</p>
              
              <p>Your job? Answer the phone, gain their trust, and extract those sweet, sweet 16-digit gift card codes before they realize they're being played. The deeper you get, the larger your quotas become. Fail to meet Brody's strict daily quotas, and you'll find yourself out on the street again—or worse.</p>

              <p>As you progress through your shifts, you'll receive more emails from Brody and his associates, uncovering the true scale of the dark web economy you've stumbled into. Welcome to the team. Trust no one, and always secure the bag.</p>
            </div>
          )}

          {activeTab === "gameplay" && (
            <div>
              <h3>The Core Loop</h3>
              <p>Your workday revolves around shifts. During a shift, your phone will ring. Answer it to begin your scam.</p>
              <ul>
                <li><strong>Turn-Based Dialogue:</strong> You must wait your turn. When it's your turn, you can either type a response or hold down the <strong>Talk button (or V key)</strong> to speak using your microphone.</li>
                <li><strong>The Trust Bar:</strong> Each caller has a starting level of Suspicion. The higher their Suspicion, the less they trust you. Your goal is to calm them down, agree with them, and speak their language. If Suspicion hits 100%, they hang up and you get nothing.</li>
                <li><strong>Overtime:</strong> If the clock runs out while you are on a call, you enter Overtime. You can finish the current scam, but no new calls will come in.</li>
              </ul>
              
              <h3>Gift Card Scams & The Credit Card Side Quest</h3>
              <p>The primary goal of any call is to gain enough trust that the caller reads out their <strong>Gift Card Code</strong>. Be extremely careful—if you ask too early, they will grow suspicious. Once they read it, you must type the exact code into the <strong>Redeem App</strong> to cash it in.</p>
              <p><strong>The Credit Card Side Quest:</strong> Occasionally, callers will have secondary technical issues (like a loud PC, a locked smart fridge, or a malfunctioning microwave). In these rare Side Quests, they will offer to pay you with a <strong>Wobblebucks Credit Card</strong> to fix the issue. You must take this specific code and run it through the <strong>Wobblebucks Machine</strong>. Be prepared for anything, as these side quests require you to navigate entirely different conversation branches and handle complex tech support lies.</p>
              
              <h3>Bait Callers & QA Audits</h3>
              <p><strong>Bait Callers:</strong> Keep an ear out for undercover scam-busters. If their setup sounds too perfect, they ask odd technical questions, or they deliberately stall you, hang up immediately! If you attempt to redeem a Bait Caller's fake code, your computer will be hacked, you'll be heavily fined, and your shift will instantly fail.</p>
              <p><strong>QA Audits:</strong> Occasionally, your boss Skibidi will email you a secret mid-call objective (e.g., "Upsell them to $500" or "Do not curse"). A "QA AUDIT" strip will appear under the Trust bar. Complete the objective for bonus XP and cash, but fail and he'll aggressively raise your daily quota!</p>
            </div>
          )}

          {activeTab === "characters" && (
            <div>
              <h3>The Target Dossier</h3>
              <p>Every caller has a unique personality, obsession, and triggers. You must adapt your persona to match theirs:</p>
              <ul>
                <li><strong>Evan (The Overthinker):</strong> A nervous guy trying to send flowers to his crush. <em>Strategy:</em> Be patient, kind, and give him dating advice. Never threaten to tell his friend CJ!</li>
                <li><strong>Uncle Mike (The Grump):</strong> An opinionated boomer who HATES the Georgia football team. <em>Strategy:</em> Trash talk Georgia football. Give confident, straight answers. Never defend Georgia or use tech jargon.</li>
                <li><strong>Brody (The Foodie):</strong> A laid-back guy who called right before dinner and is hangry. <em>Strategy:</em> Call him "chef", talk about his food, and NEVER rush him mid-bite.</li>
                <li><strong>Pete (The Gym Bro):</strong> A high-energy, bald personal trainer doing pushups mid-call. <em>Strategy:</em> Match his energy! Call him "champ", talk about reps and macros, and give quick coach-like instructions.</li>
                <li><strong>CJ (The Streamer):</strong> A chronically online gamer streaming your call live to his chat. <em>Strategy:</em> Speak in pure brainrot (sigma, rizz, aura). Never use corporate language or pressure him.</li>
                <li><strong>Hudson (The Movie Buff):</strong> A chill guy eating popcorn. <em>Strategy:</em> Keep it unhurried, rate things out of ten, and talk about popcorn butter ratios.</li>
                <li><strong>Grandma:</strong> A sweet older lady. <em>Strategy:</em> Keep it extremely polite, slow, and simple.</li>
                <li><strong>Boen:</strong> A super friendly guy three weeks into learning Mandarin and counting down the days to his dream trip to China.</li>
                <li><strong>Tonald Drump:</strong> A boastful man who never lets you forget he's the President of the United States of America.</li>
                <li><strong>Grandpa Gus:</strong> Gruff, hard-of-hearing old-timer who calls the internet 'the world wide wire'.</li>
                <li><strong>Hubble:</strong> Gadget-obsessed tech geek with a seven-screen battle station and a router named Gerald.</li>
                <li><strong>Jordan:</strong> Fast-talking optimist who's sure his big win is one bet away. He's lost his couch and his lucky socks this week.</li>
                <li><strong>Sarah:</strong> Bubbly college student, always walking to class. She sat through a cyber-safety lecture, so she's sharper than she sounds.</li>
                <li><strong>The Villain:</strong> A dramatic cartoon super-villain with a volcano lair and a team of henchmen all named Doug.</li>
              </ul>
              <p>As you unlock these characters, their details will be permanently documented in your desktop's <strong>Characters App</strong>.</p>
            </div>
          )}

          {activeTab === "economy" && (
            <div>
              <h3>Money, XP, and Progression</h3>
              <p>Your banked money is separate from your shift earnings. Shift earnings only become banked if you pass your quota at the end of the shift. If you fail, the shift earnings are lost.</p>
              
              <h3>The Dark Web Shop</h3>
              <p>Between shifts, open the <strong>Shop</strong> to spend your banked money on critical upgrades:</p>
              <ul>
                <li><strong>Perks:</strong> Buy software upgrades to reduce initial caller suspicion, extend your shift timer, or increase the payout multiplier for every successfully redeemed card.</li>
                <li><strong>Cosmetics:</strong> Buy new retro wallpapers and window color schemes to customize your workstation.</li>
              </ul>
              
              <h3>Career vs Sandbox</h3>
              <p>In <strong>Career Mode</strong>, you earn XP, level up, unlock new callers, and must survive the daily quota grind.</p>
              <p>In <strong>Sandbox Mode</strong>, you are given unlimited money and time. You have access to the <strong>Control Panel</strong>, allowing you to force specific characters to call you instantly, trigger live QA Audits, or manually set a caller's trust level, so you can practice your social engineering techniques in a risk-free environment.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

