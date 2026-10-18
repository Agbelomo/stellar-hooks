/** Test stub for the optional `@ledgerhq/hw-transport-webusb` peer package. */
export default {
  create: async (): Promise<{ close: () => Promise<void> }> => ({
    close: async () => undefined,
  }),
};
