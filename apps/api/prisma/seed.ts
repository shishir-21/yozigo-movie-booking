import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const demoMovies = [
  {
    title: 'The Last Horizon',
    posterUrl: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=900&q=85',
    language: 'English',
    durationMin: 128,
    rating: 'UA' as const,
    description: 'A deep-space expedition discovers a signal that could change humanity forever.',
    pricePaise: 25000,
  },
  {
    title: 'Midnight in Kyoto',
    posterUrl: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=900&q=85',
    language: 'Japanese',
    durationMin: 114,
    rating: 'U' as const,
    description: 'One unexpected evening brings two strangers together in a city of quiet wonders.',
    pricePaise: 22000,
  },
  {
    title: 'The Deep Signal',
    posterUrl: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=900&q=85',
    language: 'English',
    durationMin: 121,
    rating: 'A' as const,
    description: 'A radio astronomer follows a mysterious transmission to a long-buried secret.',
    pricePaise: 28000,
  },
];

async function main() {
  const seats = Array.from({ length: 8 }, (_, rowIndex) =>
    Array.from({ length: 10 }, (_, seatIndex) => ({
      row: String.fromCharCode(65 + rowIndex),
      number: seatIndex + 1,
    })),
  ).flat();

  for (const seat of seats) {
    await prisma.seat.upsert({
      where: { row_number: { row: seat.row, number: seat.number } },
      update: {},
      create: seat,
    });
  }

  // Keep demo catalogue records stable across repeated seed runs.
  const movies = [];
  for (const demo of demoMovies) {
    const existing = await prisma.movie.findFirst({
      where: { title: demo.title, language: demo.language },
      select: { id: true },
    });
    const { pricePaise, ...movieData } = demo;
    const movie = existing
      ? await prisma.movie.update({ where: { id: existing.id }, data: movieData })
      : await prisma.movie.create({ data: movieData });

    // Seed two upcoming shows. Matching exact timestamps prevents duplicates
    // when this script is run more than once on the same day.
    for (const daysAhead of [1, 2]) {
      const startsAt = new Date();
      startsAt.setDate(startsAt.getDate() + daysAhead);
      startsAt.setHours(daysAhead === 1 ? 18 : 20, 0, 0, 0);
      const existingShow = await prisma.show.findFirst({
        where: { movieId: movie.id, startsAt },
        select: { id: true },
      });
      if (existingShow) {
        await prisma.show.update({ where: { id: existingShow.id }, data: { pricePaise } });
      } else {
        await prisma.show.create({ data: { movieId: movie.id, startsAt, pricePaise } });
      }
    }
    movies.push(movie.title);
  }

  console.info(`Ensured ${seats.length} cinema seats and ${movies.length} demo movies exist.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
