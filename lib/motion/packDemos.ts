import type { MotionGraphicRequest } from "./types";

export const packDemos: MotionGraphicRequest[] = [
  { type: "STACK_BUILD", layers: [
    { label: "Vercel", role: "INFRASTRUCTURE" },
    { label: "PostgreSQL", role: "DATA" },
    { label: "API", role: "LOGIC" },
    { label: "React", role: "INTERFACE" },
  ] },
  { type: "TIMELINE", events: [
    { when: "2024", label: "Primer prototipo" },
    { when: "2025", label: "Prueba piloto" },
    { when: "2026", label: "Lanzamiento" },
  ] },
  { type: "SYSTEM_DIAGRAM", nodes: [
    { id: "user", label: "Usuario", kind: "USER" },
    { id: "api", label: "API", kind: "API" },
    { id: "ai", label: "IA", kind: "AI" },
    { id: "db", label: "Base de datos", kind: "DATABASE" },
  ], connections: [{ from: "user", to: "api" }, { from: "api", to: "ai" }, { from: "ai", to: "db" }] },
  { type: "FUNNEL_FLOW", stages: ["Visita", "Landing", "WhatsApp", "Cita"] },
  { type: "METRIC_COUNTER", label: "Tiempo de edición", from: 180, to: 20, unit: "minutos" },
  { type: "BEFORE_AFTER", scene: "WORKSPACE",
    before: { label: "Hojas sueltas", state: "FRAGMENTED" },
    after: { label: "Expediente centralizado", state: "ORGANIZED" } },
  { type: "UI_HIGHLIGHT", surface: "LANDING", elements: [
    { label: "Servicios", role: "CARD" },
    { label: "Agendar por WhatsApp", role: "BUTTON" },
    { label: "Datos de contacto", role: "INPUT" },
  ], focus: [1, 2] },
  { type: "APP_FLOW", screens: [
    { name: "Consulta", action: "Elegir horario" },
    { name: "Datos de contacto", action: "Confirmar cita" },
    { name: "Cita agendada", action: "Ver confirmación" },
  ] },
];
