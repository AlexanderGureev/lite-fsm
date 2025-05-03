import { vi, afterEach } from "vitest";

// Очистка моков после каждого теста
afterEach(() => {
  vi.clearAllMocks();
});

// Устанавливаем фейковый timers для тестов с асинхронностью
vi.useFakeTimers();

// Экспортируем для случаев, когда нужно что-то настроить в тестах
export const resetModules = () => {
  vi.resetModules();
};
