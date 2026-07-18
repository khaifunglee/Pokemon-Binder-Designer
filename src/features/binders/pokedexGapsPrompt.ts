import { Alert } from 'react-native';

import { db } from '../../db/client';
import { setPokedexGaps } from '../../db/settingsService';

/**
 * Ask how pokédex sorting should treat missing Pokémon, persist the
 * choice (1-tap re-organize and physical re-sort reuse it), then run.
 */
export function promptPokedexGaps(proceed: () => void): void {
  Alert.alert(
    'Pokédex sort',
    'Leave an empty pocket for each missing Pokémon, or pack cards together with no gaps?',
    [
      {
        text: 'With gaps',
        onPress: () => {
          void setPokedexGaps(db, true).then(proceed);
        },
      },
      {
        text: 'No gaps',
        onPress: () => {
          void setPokedexGaps(db, false).then(proceed);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ],
  );
}
