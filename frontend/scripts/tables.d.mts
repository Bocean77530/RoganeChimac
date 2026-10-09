export type ProvisionedTable = {
  id: string;
  code: string;
  label: string;
  active: boolean;
  token_version: number;
};

export function signProvisionedTable(
  table: { restaurantId: string; tableId: string; tokenVersion: number },
  secret: string,
): string;

export function placardDirectory(
  output: string,
  restaurantId: string,
  tableId: string,
  tokenVersion: number,
): string;

export function runTableCommand(
  argv: string[],
  environment?: Record<string, string | undefined>,
  write?: (message: string) => void,
  render?: (input: {
    table: ProvisionedTable;
    restaurant: { id: string; name: string; slug: string };
    secret: string;
    origin: string;
    output: string;
    python: string;
  }) => Promise<void>,
): Promise<ProvisionedTable[]>;
