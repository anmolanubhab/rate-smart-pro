// Routes: /vouchers/payment | /vouchers/payment/:id/edit
import UniversalVoucherEntry from "@/components/vouchers/UniversalVoucherEntry";

export default function PaymentVoucher() {
  return <UniversalVoucherEntry type="Payment" />;
}
