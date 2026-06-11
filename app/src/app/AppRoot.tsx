// SPDX-License-Identifier: AGPL-3.0-or-later

import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DbProvider } from '../shared/db/DbProvider';
import { UfsScreen } from '../ui/screens/UfsScreen';

export function AppRoot() {
  return (
    <SafeAreaProvider>
      <DbProvider>
        <UfsScreen />
      </DbProvider>
    </SafeAreaProvider>
  );
}
