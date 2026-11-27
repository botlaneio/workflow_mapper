import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { base64ToBytes, bytesToBase64 } from "@shared/bytes";
import type { RevealedEstimates } from "@shared/types";

export interface Person {
  id: string;
  name: string;
  role: "presenter" | "client";
  focus: string;
  color: string;
}

export function useRoom(options: { url: string; role: "presenter" | "client"; name: string; clientId?: string; enabled?: boolean }) {
  const shared = useMemo(() => new Y.Doc(), [options.url]);
  const priv = useMemo(() => new Y.Doc(), [options.url]);
  const [status, setStatus] = useState<"connecting" | "live" | "reconnecting" | "closed">("connecting");
  const [synced, setSynced] = useState(false);
  const [version, setVersion] = useState(0);
  const [people, setPeople] = useState<Person[]>([]);
  const [showEstimates, setShowEstimates] = useState(false);
  const [revealed, setRevealed] = useState<RevealedEstimates | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const syncedRef = useRef(false);
  const nameRef = useRef(options.name);
  nameRef.current = options.name;

  useEffect(() => {
    const bump = () => setVersion((value) => value + 1);
    shared.on("update", bump);
    priv.on("update", bump);
    return () => {
      shared.off("update", bump);
      priv.off("update", bump);
    };
  }, [shared, priv]);

  useEffect(() => {
    const publish = (docName: "shared" | "private") => (update: Uint8Array, origin: unknown) => {
      if (origin === "remote" || !syncedRef.current) return;
      const socket = wsRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ t: "update", doc: docName, update: bytesToBase64(update) }));
    };
    const onShared = publish("shared");
    const onPrivate = publish("private");
    shared.on("update", onShared);
    priv.on("update", onPrivate);
    return () => {
      shared.off("update", onShared);
      priv.off("update", onPrivate);
    };
  }, [shared, priv]);

  useEffect(() => {
    if (options.enabled === false) return;
    let stopped = false;
    let socket: WebSocket | null = null;
    let attempt = 0;
    let opened = false;
    let timer = 0;
    let sharedStep2 = false;
    let sharedStep1 = false;
    let privateStep2 = false;
    let privateStep1 = false;
    const queued: { doc: "shared" | "private"; update: Uint8Array }[] = [];

    const send = (message: unknown) => {
      if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    };
    const markReady = () => {
      const privOk = options.role !== "presenter" || (privateStep2 && privateStep1);
      if (sharedStep2 && sharedStep1 && privOk) {
        syncedRef.current = true;
        setSynced(true);
      }
    };

    const connect = () => {
      if (stopped) return;
      syncedRef.current = false;
      setSynced(false);
      sharedStep2 = sharedStep1 = privateStep2 = privateStep1 = false;
      setStatus(opened ? "reconnecting" : "connecting");
      socket = new WebSocket(options.url);
      wsRef.current = socket;
      socket.onopen = () => {
        if (stopped) return;
        opened = true;
        attempt = 0;
        setStatus("live");
        send({ t: "hello", name: nameRef.current, clientId: options.clientId });
        send({ t: "sync-step1", doc: "shared", sv: bytesToBase64(Y.encodeStateVector(shared)) });
        if (options.role === "presenter") send({ t: "sync-step1", doc: "private", sv: bytesToBase64(Y.encodeStateVector(priv)) });
      };
      socket.onmessage = (event) => {
        const msg = JSON.parse(String(event.data)) as {
          t: string;
          doc?: "shared" | "private";
          update?: string;
          sv?: string;
          people?: Person[];
          key?: string;
          value?: boolean;
          estimates?: RevealedEstimates | null;
        };
        if ((msg.t === "sync-step2" || msg.t === "update") && msg.doc && msg.update) {
          if (msg.doc === "private" && options.role !== "presenter") return;
          const bytes = base64ToBytes(msg.update);
          const readyForDoc = msg.doc === "private" ? privateStep2 : sharedStep2;
          if (msg.t === "update" && !readyForDoc) {
            queued.push({ doc: msg.doc, update: bytes });
          } else {
            const doc = msg.doc === "private" ? priv : shared;
            Y.applyUpdate(doc, bytes, "remote");
          }
          if (msg.t === "sync-step2" && msg.doc === "shared") sharedStep2 = true;
          if (msg.t === "sync-step2" && msg.doc === "private") privateStep2 = true;
          if (msg.t === "sync-step2") {
            const rest = queued.filter((item) => item.doc === msg.doc);
            for (const item of rest) Y.applyUpdate(item.doc === "private" ? priv : shared, item.update, "remote");
            for (let i = queued.length - 1; i >= 0; i--) if (queued[i]?.doc === msg.doc) queued.splice(i, 1);
          }
          markReady();
        } else if (msg.t === "sync-step1" && msg.doc && msg.sv) {
          const doc = msg.doc === "private" ? priv : shared;
          const update = Y.encodeStateAsUpdate(doc, base64ToBytes(msg.sv));
          if (update.byteLength > 2) send({ t: "sync-step2", doc: msg.doc, update: bytesToBase64(update) });
          if (msg.doc === "shared") sharedStep1 = true;
          if (msg.doc === "private") privateStep1 = true;
          markReady();
        } else if (msg.t === "presence") setPeople(msg.people ?? []);
        else if (msg.t === "flag" && msg.key === "showEstimates") setShowEstimates(msg.value === true);
        else if (msg.t === "revealed") setRevealed(msg.estimates ?? null);
      };
      socket.onclose = () => {
        syncedRef.current = false;
        setSynced(false);
        if (stopped) return;
        setStatus("reconnecting");
        timer = window.setTimeout(connect, Math.min(8000, 400 * 2 ** attempt++));
      };
    };
    connect();
    const ping = window.setInterval(() => send({ t: "ping" }), 25000);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.clearInterval(ping);
      socket?.close();
      wsRef.current = null;
    };
  }, [options.url, options.role, options.clientId, options.enabled, shared, priv]);

  useEffect(() => {
    const socket = wsRef.current;
    if (!synced || !socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ t: "hello", name: options.name, clientId: options.clientId }));
  }, [options.name, options.clientId, synced]);

  const sendFocus = (focus: string) => {
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: "focus", focus }));
  };
  const setEstimates = (value: boolean) => {
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ t: "set-flag", key: "showEstimates", value }));
    }
  };

  return { shared, priv, status, synced, version, people, showEstimates, revealed, sendFocus, setEstimates };
}
