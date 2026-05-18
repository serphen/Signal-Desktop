// Copyright 2022 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import lodash from 'lodash';
import { isSorted } from './isSorted.std.ts';
import { strictAssert } from './assert.std.ts';

const { clamp } = lodash;

// Midnight: no compact icon-only mode, just continuous resize
export const MIN_WIDTH = 150;
export const SNAP_WIDTH = 150;
export const MIN_FULL_WIDTH = 150;
export const MAX_WIDTH = 380;
strictAssert(
  isSorted([MIN_WIDTH, SNAP_WIDTH, MIN_FULL_WIDTH, MAX_WIDTH]),
  'Expected widths to be in the right order'
);

export function getWidthFromPreferredWidth(
  preferredWidth: number,
  { requiresFullWidth: _requiresFullWidth }: { requiresFullWidth: boolean }
): number {
  return clamp(preferredWidth, MIN_WIDTH, MAX_WIDTH);
}
