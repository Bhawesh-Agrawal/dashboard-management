import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { enforceProductionGuard } from "../scripts/guard";

enforceProductionGuard("prisma/seed.ts");

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const quotes = [
  // Productivity & Focus
  { text: "The secret of getting ahead is getting started.", source: "Mark Twain", tags: ["productivity", "motivation"] },
  { text: "It is not enough to be busy. The question is: what are we busy about?", source: "Henry David Thoreau", tags: ["productivity", "focus"] },
  { text: "The way to get started is to quit talking and begin doing.", source: "Walt Disney", tags: ["productivity", "action"] },
  { text: "Focus on being productive instead of busy.", source: "Tim Ferriss", tags: ["productivity", "focus"] },
  { text: "Action is the foundational key to all success.", source: "Pablo Picasso", tags: ["productivity", "action"] },

  // Perseverance & Resilience
  { text: "It does not matter how slowly you go as long as you do not stop.", source: "Confucius", tags: ["perseverance", "growth"] },
  { text: "Fall seven times, stand up eight.", source: "Japanese Proverb", tags: ["perseverance", "resilience"] },
  { text: "The only impossible journey is the one you never begin.", source: "Tony Robbins", tags: ["perseverance", "courage"] },
  { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", source: "Winston Churchill", tags: ["perseverance", "courage"] },
  { text: "Our greatest glory is not in never falling, but in rising every time we fall.", source: "Oliver Goldsmith", tags: ["perseverance", "resilience"] },

  // Learning & Growth
  { text: "The beautiful thing about learning is that nobody can take it away from you.", source: "B.B. King", tags: ["learning", "growth"] },
  { text: "Education is the most powerful weapon which you can use to change the world.", source: "Nelson Mandela", tags: ["learning", "impact"] },
  { text: "The more that you read, the more things you will know. The more that you learn, the more places you will go.", source: "Dr. Seuss", tags: ["learning", "growth"] },
  { text: "An investment in knowledge pays the best interest.", source: "Benjamin Franklin", tags: ["learning", "investment"] },
  { text: "Live as if you were to die tomorrow. Learn as if you were to live forever.", source: "Mahatma Gandhi", tags: ["learning", "growth"] },

  // Discipline & Consistency
  { text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", source: "Aristotle", tags: ["discipline", "habit"] },
  { text: "Motivation is what gets you started. Habit is what keeps you going.", source: "Jim Ryun", tags: ["discipline", "habit"] },
  { text: "Success is the sum of small efforts, repeated day in and day out.", source: "Robert Collier", tags: ["discipline", "consistency"] },
  { text: "Discipline is the bridge between goals and accomplishment.", source: "Jim Rohn", tags: ["discipline", "achievement"] },
  { text: "Small daily improvements over time lead to stunning results.", source: "Robin Sharma", tags: ["discipline", "growth"] },

  // Mindset & Attitude
  { text: "Your attitude, not your aptitude, will determine your altitude.", source: "Zig Ziglar", tags: ["mindset", "attitude"] },
  { text: "The mind is everything. What you think you become.", source: "Buddha", tags: ["mindset", "growth"] },
  { text: "Believe you can and you are halfway there.", source: "Theodore Roosevelt", tags: ["mindset", "belief"] },
  { text: "Positive thinking will let you do everything better than negative thinking will.", source: "Zig Ziglar", tags: ["mindset", "positivity"] },
  { text: "The only limit to our realization of tomorrow is our doubts of today.", source: "Franklin D. Roosevelt", tags: ["mindset", "belief"] },

  // Time & Balance
  { text: "The key is not to prioritize your schedule, but to schedule your priorities.", source: "Stephen Covey", tags: ["time", "priority"] },
  { text: "Lost time is never found again.", source: "Benjamin Franklin", tags: ["time", "urgency"] },
  { text: "You will never find time for anything. If you want time, you must make it.", source: "Charles Buxton", tags: ["time", "proactivity"] },
];

async function main() {
  let count = 0;
  for (const quote of quotes) {
    const existing = await prisma.quote.findFirst({ where: { text: quote.text } });
    if (!existing) {
      await prisma.quote.create({ data: quote });
      count++;
    }
  }
  console.log(`Seeded ${count} new quotes (${quotes.length - count} already existed)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
