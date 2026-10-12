import { useEffect, useState } from 'react';
import { useBackend, useSession } from '../../app/session';
import type { WardrobePrice } from '../../backend/types';

/** 부모가 정한 꾸미기 상품 가격. 읽지 못하면 처음 가격으로 보인다. */
export function useWardrobePrices(): WardrobePrice[] {
  const backend = useBackend();
  const { family } = useSession();
  const [prices, setPrices] = useState<WardrobePrice[]>([]);
  useEffect(() => backend.watchWardrobePrices(family.id, setPrices, () => setPrices([])), [backend, family.id]);
  return prices;
}
