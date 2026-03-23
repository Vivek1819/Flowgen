-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "metadata" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "metadata" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "metadata" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "metadata" TEXT;
