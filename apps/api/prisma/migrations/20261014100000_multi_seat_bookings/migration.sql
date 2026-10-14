-- Multi-seat bookings: associate each converted hold with its shared booking.
ALTER TABLE "SeatHold" ADD COLUMN "bookingId" TEXT;

UPDATE "SeatHold" AS hold
SET "bookingId" = booking."id"
FROM "Booking" AS booking
WHERE booking."holdId" = hold."id";

ALTER TABLE "Booking" DROP CONSTRAINT "Booking_holdId_fkey";
DROP INDEX "Booking_holdId_key";
ALTER TABLE "Booking" DROP COLUMN "holdId";

ALTER TABLE "SeatHold"
ADD CONSTRAINT "SeatHold_bookingId_fkey"
FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
