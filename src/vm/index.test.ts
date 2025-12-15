import { describe, it, expect, beforeAll } from "vitest";
import { VirtualMachine } from "./index";

describe("VirtualMachine", () => {
  describe("Step 4: Basic filesystem", () => {
    it("should write and read files", async () => {
      const vm = new VirtualMachine();
      await vm.init();

      vm.writeFile("/foo.txt", "bar");
      expect(await vm.readFile("/foo.txt")).toBe("bar");
    });

    it("should write and read binary files", async () => {
      const vm = new VirtualMachine();
      await vm.init();

      const data = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
      vm.writeFile("/binary.bin", data);

      const result = await vm.readFileBinary("/binary.bin");
      expect(result).toEqual(data);
    });

    it("should check if files exist", async () => {
      const vm = new VirtualMachine();
      await vm.init();

      vm.writeFile("/exists.txt", "yes");

      expect(await vm.exists("/exists.txt")).toBe(true);
      expect(await vm.exists("/notexists.txt")).toBe(false);
    });

    it("should list directory contents", async () => {
      const vm = new VirtualMachine();
      await vm.init();

      vm.mkdir("/mydir");
      vm.writeFile("/mydir/a.txt", "a");
      vm.writeFile("/mydir/b.txt", "b");

      const entries = await vm.readDir("/mydir");
      expect(entries).toContain("a.txt");
      expect(entries).toContain("b.txt");
    });

    it("should remove files", async () => {
      const vm = new VirtualMachine();
      await vm.init();

      vm.writeFile("/remove.txt", "delete me");
      expect(await vm.exists("/remove.txt")).toBe(true);

      await vm.remove("/remove.txt");
      expect(await vm.exists("/remove.txt")).toBe(false);
    });

    it("should expose underlying SystemBridge and Directory", async () => {
      const vm = new VirtualMachine();
      await vm.init();

      expect(vm.getSystemBridge()).toBeDefined();
      expect(vm.getDirectory()).toBeDefined();
    });

    it("should initialize only once", async () => {
      const vm = new VirtualMachine();
      await vm.init();
      await vm.init(); // Should not throw

      vm.writeFile("/test.txt", "ok");
      expect(await vm.readFile("/test.txt")).toBe("ok");
    });
  });
});
