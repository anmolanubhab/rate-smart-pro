// Routes: /vouchers/receipt | /vouchers/receipt/:id/edit
import UniversalVoucherEntry from "@/components/vouchers/UniversalVoucherEntry";

export default function ReceiptVoucher() {
  return <UniversalVoucherEntry type="Receipt" />;
}
