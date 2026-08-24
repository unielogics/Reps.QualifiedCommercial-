import {
  BadgeDollarSign,
  Building2,
  Factory,
  Landmark,
  Repeat2,
  ShoppingBasket,
  Split,
  Tractor,
  Truck,
  WalletCards,
} from "lucide-react";

const icons = {
  term_loan_3_5_year: Landmark,
  term_loan_10_year: WalletCards,
  line_of_credit: Repeat2,
  term_loan_loc_hybrid: Split,
  equipment_financing: Tractor,
  jumbo_term_loan: Building2,
  transportation_finance: Truck,
  sba: BadgeDollarSign,
  sba_grocery: ShoppingBasket,
  sba_made_in_america: Factory,
} as const;

export function ProductIcon({ programKey, size = 22 }: { programKey: string; size?: number }) {
  const Icon = icons[programKey as keyof typeof icons];
  return Icon ? <Icon aria-hidden="true" size={size} strokeWidth={1.8} /> : null;
}
