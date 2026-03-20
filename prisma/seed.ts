import { existsSync } from "node:fs";
import process from "node:process";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";

if (existsSync(".env")) {
  process.loadEnvFile?.(".env");
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set. Configure it before seeding.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: databaseUrl
  })
});

const categorySeeds = [
  {
    name: "Body Parts",
    slug: "body-parts",
    description: "Words related to the body and its parts.",
    colorToken: "moss"
  },
  {
    name: "Animals",
    slug: "animals",
    description: "Animal vocabulary and related concepts.",
    colorToken: "clay"
  },
  {
    name: "Weather",
    slug: "weather",
    description: "Weather, seasons, and environmental conditions.",
    colorToken: "lake"
  },
  {
    name: "Colours",
    slug: "colours",
    description: "Colour and descriptive-state words.",
    colorToken: "clay"
  },
  {
    name: "Movement",
    slug: "movement",
    description: "Movement and motion vocabulary.",
    colorToken: "moss"
  },
  {
    name: "Food",
    slug: "food",
    description: "Food, meals, and ingredients.",
    colorToken: "clay"
  },
  {
    name: "Kinship",
    slug: "kinship",
    description: "Family and kinship vocabulary.",
    colorToken: "moss"
  },
  {
    name: "Hunting",
    slug: "hunting",
    description: "Land-based and hunting-related vocabulary.",
    colorToken: "lake"
  }
] as const;

async function main() {
  await prisma.mediaAsset.deleteMany();
  await prisma.savedWord.deleteMany();
  await prisma.relation.deleteMany();
  await prisma.morphologyEntry.deleteMany();
  await prisma.morphologyTable.deleteMany();
  await prisma.wordMeaning.deleteMany();
  await prisma.wordCategory.deleteMany();
  await prisma.word.deleteMany();
  await prisma.category.deleteMany();

  const categories = await Promise.all(
    categorySeeds.map((category) =>
      prisma.category.create({
        data: category
      })
    )
  );

  console.log(`Seeded ${categories.length} empty categories and 0 words.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
