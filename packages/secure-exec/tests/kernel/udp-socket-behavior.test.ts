import dgram from "node:dgram";
import { afterEach, describe, expect, it } from "vitest";
import { InMemoryFileSystem } from "../../../browser/src/os-filesystem.ts";
import {
	AF_INET,
	allowAllFs,
	allowAllNetwork,
	createKernel,
	SOCK_DGRAM,
} from "../../../core/src/index.ts";
import type {
	DriverProcess,
	Kernel,
	VirtualFileSystem,
} from "../../../core/src/kernel/index.ts";
import { createNodeHostNetworkAdapter } from "../../../nodejs/src/index.ts";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const TEST_TIMEOUT_MS = 10_000;

type KernelTestInternals = {
	posixDirsReady: Promise<void>;
	processTable: {
		allocatePid(): number;
		register(
			pid: number,
			driver: string,
			command: string,
			args: string[],
			ctx: {
				pid: number;
				ppid: number;
				env: Record<string, string>;
				cwd: string;
				fds: { stdin: number; stdout: number; stderr: number };
			},
			driverProcess: DriverProcess,
		): void;
	};
};

function requireValue<T>(value: T | null, message: string): T {
	if (value === null) {
		throw new Error(message);
	}
	return value;
}

function createMockDriverProcess(): DriverProcess {
	let resolveExit!: (code: number) => void;
	const exitPromise = new Promise<number>((resolve) => {
		resolveExit = resolve;
	});

	return {
		writeStdin() {},
		closeStdin() {},
		kill(signal) {
			resolveExit(128 + signal);
		},
		wait() {
			return exitPromise;
		},
		onStdout: null,
		onStderr: null,
		onExit: null,
	};
}

function registerKernelPid(kernel: Kernel, ppid = 0): number {
	const internal = kernel as Kernel & KernelTestInternals;
	const pid = internal.processTable.allocatePid();
	internal.processTable.register(
		pid,
		"test",
		"test",
		[],
		{
			pid,
			ppid,
			env: {},
			cwd: "/",
			fds: { stdin: 0, stdout: 1, stderr: 2 },
		},
		createMockDriverProcess(),
	);
	return pid;
}

async function createUdpKernel(options?: { hostNetwork?: boolean }): Promise<{
	kernel: Kernel;
	vfs: VirtualFileSystem;
	dispose: () => Promise<void>;
}> {
	const vfs = new InMemoryFileSystem();
	const kernel = createKernel({
		filesystem: vfs,
		hostNetworkAdapter: options?.hostNetwork
			? createNodeHostNetworkAdapter()
			: undefined,
		permissions: options?.hostNetwork
			? { ...allowAllFs, ...allowAllNetwork }
			: undefined,
	});
	await (kernel as Kernel & KernelTestInternals).posixDirsReady;

	return {
		kernel,
		vfs,
		dispose: () => kernel.dispose(),
	};
}

async function waitForKernelDatagram(
	kernel: Kernel,
	socketId: number,
	timeoutMs = TEST_TIMEOUT_MS,
) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const result = kernel.socketTable.recvFrom(socketId, 4096);
		if (result !== null) {
			return result;
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	throw new Error(`timed out waiting for UDP datagram on socket ${socketId}`);
}

async function bindHostUdpSocket(): Promise<dgram.Socket> {
	return await new Promise((resolve, reject) => {
		const socket = dgram.createSocket("udp4");
		socket.once("listening", () => resolve(socket));
		socket.once("error", reject);
		socket.bind(0, "127.0.0.1");
	});
}

async function waitForHostDatagram(
	socket: dgram.Socket,
	timeoutMs = TEST_TIMEOUT_MS,
): Promise<{ message: Buffer; remote: dgram.RemoteInfo }> {
	return await new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			cleanup();
			reject(new Error("timed out waiting for host UDP datagram"));
		}, timeoutMs);

		const onMessage = (message: Buffer, remote: dgram.RemoteInfo) => {
			cleanup();
			resolve({ message, remote });
		};
		const onError = (error: Error) => {
			cleanup();
			reject(error);
		};

		const cleanup = () => {
			clearTimeout(timeout);
			socket.off("message", onMessage);
			socket.off("error", onError);
		};

		socket.on("message", onMessage);
		socket.on("error", onError);
	});
}

async function sendHostDatagram(
	socket: dgram.Socket,
	message: string,
	port: number,
): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		socket.send(message, port, "127.0.0.1", (error) => {
			if (error) reject(error);
			else resolve();
		});
	});
}

async function closeHostSocket(socket: dgram.Socket): Promise<void> {
	if (socket.closed) {
		return;
	}
	await new Promise<void>((resolve) => {
		socket.close(() => resolve());
	});
}

describe("kernel UDP behavior", () => {
	let ctx: Awaited<ReturnType<typeof createUdpKernel>> | undefined;

	afterEach(async () => {
		await ctx?.dispose();
		ctx = undefined;
	});

	it("preserves datagram boundaries and sender addresses through the real kernel", async () => {
		ctx = await createUdpKernel();
		const receiverPid = registerKernelPid(ctx.kernel);
		const senderPid = registerKernelPid(ctx.kernel);

		const receiverId = ctx.kernel.socketTable.create(
			AF_INET,
			SOCK_DGRAM,
			0,
			receiverPid,
		);
		await ctx.kernel.socketTable.bind(receiverId, {
			host: "0.0.0.0",
			port: 0,
		});
		const receiverAddr = ctx.kernel.socketTable.getLocalAddr(receiverId);
		if (!("host" in receiverAddr)) {
			throw new Error("expected inet UDP receiver address");
		}

		const senderId = ctx.kernel.socketTable.create(
			AF_INET,
			SOCK_DGRAM,
			0,
			senderPid,
		);
		await ctx.kernel.socketTable.bind(senderId, {
			host: "127.0.0.1",
			port: 0,
		});
		const senderAddr = ctx.kernel.socketTable.getLocalAddr(senderId);
		if (!("host" in senderAddr)) {
			throw new Error("expected inet UDP sender address");
		}

		ctx.kernel.socketTable.sendTo(senderId, textEncoder.encode("first"), 0, {
			host: "127.0.0.1",
			port: receiverAddr.port,
		});
		ctx.kernel.socketTable.sendTo(senderId, textEncoder.encode("second"), 0, {
			host: "127.0.0.1",
			port: receiverAddr.port,
		});

		const first = requireValue(
			ctx.kernel.socketTable.recvFrom(receiverId, 1024),
			"expected first UDP datagram",
		);
		const second = requireValue(
			ctx.kernel.socketTable.recvFrom(receiverId, 1024),
			"expected second UDP datagram",
		);

		expect(textDecoder.decode(first.data)).toBe("first");
		expect(textDecoder.decode(second.data)).toBe("second");
		expect(first.srcAddr).toEqual({
			host: senderAddr.host,
			port: senderAddr.port,
		});
		expect(second.srcAddr).toEqual({
			host: senderAddr.host,
			port: senderAddr.port,
		});
	});

	it(
		"routes host-backed UDP through the node:dgram adapter with source-address reporting",
		async () => {
			ctx = await createUdpKernel({ hostNetwork: true });
			const kernelPid = registerKernelPid(ctx.kernel);
			const kernelSocketId = ctx.kernel.socketTable.create(
				AF_INET,
				SOCK_DGRAM,
				0,
				kernelPid,
			);
			await ctx.kernel.socketTable.bind(kernelSocketId, {
				host: "127.0.0.1",
				port: 0,
			});
			await ctx.kernel.socketTable.bindExternalUdp(kernelSocketId);

			const kernelAddr = ctx.kernel.socketTable.getLocalAddr(kernelSocketId);
			if (!("host" in kernelAddr)) {
				throw new Error("expected inet UDP kernel address");
			}

			const hostSocket = await bindHostUdpSocket();
			try {
				const hostAddr = hostSocket.address();
				if (typeof hostAddr === "string") {
					throw new Error("expected UDP AddressInfo");
				}

				await sendHostDatagram(hostSocket, "from-host", kernelAddr.port);
				const inbound = await waitForKernelDatagram(ctx.kernel, kernelSocketId);
				expect(textDecoder.decode(inbound.data)).toBe("from-host");
				expect(inbound.srcAddr).toEqual({
					host: hostAddr.address,
					port: hostAddr.port,
				});

				const outboundPromise = waitForHostDatagram(hostSocket);
				ctx.kernel.socketTable.sendTo(
					kernelSocketId,
					textEncoder.encode("from-kernel"),
					0,
					{
						host: "127.0.0.1",
						port: hostAddr.port,
					},
				);
				const outbound = await outboundPromise;
				expect(textDecoder.decode(outbound.message)).toBe("from-kernel");
				expect(outbound.remote.address).toBe("127.0.0.1");
				expect(outbound.remote.port).toBe(kernelAddr.port);
			} finally {
				ctx.kernel.socketTable.close(kernelSocketId, kernelPid);
				await closeHostSocket(hostSocket);
			}
		},
		TEST_TIMEOUT_MS,
	);
});
