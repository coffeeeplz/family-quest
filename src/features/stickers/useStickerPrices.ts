import { useEffect, useState } from 'react';
import { useBackend, useSession } from '../../app/session';
import type { StickerPrice } from '../../backend/types';

/** 부모가 정한 스티커 팩 가격. 읽지 못하면 처음 가격으로 보인다. */
export function useStickerPrices(): StickerPrice[] {
  const backend = useBackend();
  const { family } = useSession();
  const [prices, setPrices] = useState<StickerPrice[]>([]);
  useEffect(() => backend.watchStickerPrices(family.id, setPrices, () => setPrices([])), [backend, family.id]);
  return prices;
}
