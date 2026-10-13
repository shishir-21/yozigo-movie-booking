import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

  console.info(`Ensured ${seats.length} cinema seats exist.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
