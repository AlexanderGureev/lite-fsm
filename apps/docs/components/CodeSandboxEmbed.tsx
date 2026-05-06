"use client";

import React from "react";

type CodeSandboxProps = {
  sandboxId: string;
  options?: {
    editorHeight?: string;
    previewHeight?: string;
    autoResize?: boolean;
    fontSize?: number;
    initialModule?: string;
  };
};

export const CodeSandboxEmbed: React.FC<CodeSandboxProps> = ({ sandboxId, options = {} }) => {
  const {
    editorHeight = "350px",
    previewHeight = "350px",
    autoResize = true,
    fontSize = 12,
    initialModule = "/src/App.js",
  } = options;

  // Определяем URL для встраивания
  // Принимаем разные форматы ссылок CodeSandbox:
  // - Полные URL: https://codesandbox.io/s/xyz123
  // - ID: xyz123
  const getSandboxId = () => {
    if (sandboxId.includes("codesandbox.io")) {
      return sandboxId.split("/").pop() || "";
    }
    return sandboxId;
  };

  // Кодируем путь к модулю для использования в URL
  const encodedModule = encodeURIComponent(initialModule);

  // Иллюстрации для использования в iframe
  const embedUrl = `https://codesandbox.io/embed/${getSandboxId()}?fontsize=${fontSize}&theme=dark&autoresize=${
    autoResize ? 1 : 0
  }&view=editor&module=${encodedModule}`;

  // Вычисляем общую высоту для iframe, учитывая вертикальное расположение
  const totalHeight = `${parseInt(editorHeight) + parseInt(previewHeight)}px`;

  const iframeStyle = {
    width: "100%",
    height: totalHeight,
    border: 0,
    borderRadius: "4px",
    overflow: "hidden",
  };

  return (
    <div className="my-8">
      <iframe
        src={embedUrl}
        style={iframeStyle}
        title={`CodeSandbox: ${getSandboxId()}`}
        allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking"
        sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
      ></iframe>
    </div>
  );
};
