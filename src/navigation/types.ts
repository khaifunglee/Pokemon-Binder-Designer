export type RootStackParamList = {
  BinderList: undefined;
  Binder: { binderId: string };
  /** Card picker step 1: choose a set (or search by name). */
  PickerSets: { binderId: string; slotId: string };
  /** Card picker step 2: choose a card from the set. */
  PickerCards: { binderId: string; slotId: string; setId: string };
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
