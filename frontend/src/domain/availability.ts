export type PickupSlot = {
  id: string;
  startsAt: string;
  endsAt: string;
  localLabel: string;
  remaining: number;
  asap: boolean;
};

export type PickupAvailability = {
  serverNow: string;
  timezone: string;
  orderingEnabled: boolean;
  slots: PickupSlot[];
};

export type PickupSelection =
  | { type: "pickup"; mode: "asap" }
  | { type: "pickup"; mode: "scheduled"; slotId: string };
