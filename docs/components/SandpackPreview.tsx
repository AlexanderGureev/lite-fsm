"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  SandpackProvider,
  SandpackLayout,
  SandpackCodeEditor,
  SandpackPreview as SandpackPreviewComponent,
  SandpackConsole,
  SandpackFileExplorer,
  SandpackFiles,
  SandpackOptions,
  useSandpack,
} from "@codesandbox/sandpack-react";
import { dracula } from "@codesandbox/sandpack-themes";

import prettier from "prettier";
import parserBabel from "prettier/parser-babel";
import parserHTML from "prettier/parser-html";
import parserSCSS from "prettier/parser-postcss";
import parserTS from "prettier/parser-typescript";

import { debounce } from "../utils";

type Opts = {
  showConsole?: boolean;
  showFileExplorer?: boolean;
  editorHeight?: string;
  activeFile?: string;
  autorun?: boolean;
  readOnly?: boolean;
};

type SandpackProps = {
  files: SandpackFiles;
  template?: "react" | "react-ts" | "nextjs" | "node" | "vanilla-ts" | "vanilla";
  options?: Opts;
  customSetup?: {
    dependencies?: Record<string, string>;
  };
};

export const SandpackPreview: React.FC<SandpackProps> = ({
  files,
  template = "react-ts",
  options = {},
  customSetup,
}) => {
  const { showFileExplorer = false, activeFile, autorun = true } = options;

  const sandpackOptions: SandpackOptions = {
    autorun,
    activeFile,
  };

  // Объединяем пользовательские зависимости с lite-fsm
  const dependencies = {
    "lite-fsm": "latest",
    ...(customSetup?.dependencies || {}),
  };

  return (
    <div className="my-8">
      <SandpackProvider
        template={template}
        files={files}
        theme={dracula}
        options={sandpackOptions}
        customSetup={{ dependencies }}
      >
        <SandpackLayout>
          {showFileExplorer && <SandpackFileExplorer />}
          <EditorWithPrettier {...options} />
        </SandpackLayout>
      </SandpackProvider>
    </div>
  );
};

function EditorWithPrettier(options: Opts) {
  const { prettier } = useIsPrettier();
  const { sandpack } = useSandpack();
  const [isEditorReady, setIsEditorReady] = useState(false);

  useEffect(() => {
    // Устанавливаем состояние готовности редактора, когда sandpack будет готов
    const status = sandpack.status;
    if (status === "running" || status === "idle") {
      setIsEditorReady(true);
    }
  }, [sandpack.status]);

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, position: "relative" }}>
        {!isEditorReady && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "#282a36",
              zIndex: 10,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              color: "#f8f8f2",
              fontFamily: "monospace",
              fontSize: "14px",
              opacity: 1,
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{ marginBottom: "12px" }}>
                <LoadingDots />
              </div>
              <div>Загрузка редактора...</div>
            </div>
          </div>
        )}
        {prettier && <PrettierPlugin />}
        {isEditorReady ? (
          <>
            <SandpackCodeEditor
              style={{ height: options.editorHeight || "400px" }}
              showLineNumbers={true}
              showInlineErrors={true}
              readOnly={options.readOnly}
            />
            <SandpackPreviewComponent />
            {options.showConsole && <SandpackConsole />}
          </>
        ) : (
          <div style={{ height: options.editorHeight || "400px", background: "#282a36" }}></div>
        )}
      </div>
    </>
  );
}

// Prettier Plugin Button
function PrettierPlugin() {
  const { error, success, prettifyCode } = usePrettier();

  useEffect(() => {
    prettifyCode();
  }, []);

  return null;

  // return (
  //   <button
  //     style={{
  //       color: error ? "#ef4444" : success ? "#22c55e" : "#808080",
  //     }}
  //     className="prettier"
  //     onClick={prettifyCode}
  //   >
  //     {error ? <DangerIcon size={12} /> : <CheckIcon size={12} />}
  //     Prettier
  //   </button>
  // );
}

// Check Icon Component
function CheckIcon({ size }: { size: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      strokeWidth={2.5}
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

// Danger Icon Component
function DangerIcon({ size }: { size: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      strokeWidth={2.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m0-10.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.25-8.25-3.286Zm0 13.036h.008v.008H12v-.008Z"
      />
    </svg>
  );
}

// Hook to check if Prettier is supported
const useIsPrettier = () => {
  const [prettier, setPrettier] = useState(false);
  const { sandpack } = useSandpack();

  useEffect(() => {
    const activeFile = sandpack.files[sandpack.activeFile];
    if (!activeFile) return;

    const fileExtension = sandpack.activeFile.split(".").pop()?.toLowerCase();
    if (!fileExtension) return;

    const prettierExtensions = ["js", "ts", "jsx", "tsx", "scss", "css", "html"];
    const isPrettierSupported = !(activeFile.readOnly || !prettierExtensions.includes(fileExtension));

    setPrettier(isPrettierSupported);
  }, [sandpack.files, sandpack.activeFile]);

  return { prettier };
};

// Hook to handle Prettier formatting
const usePrettier = () => {
  const [error, setError] = useState(false);
  const [success, setSuccess] = useState(false);
  const { sandpack } = useSandpack();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        prettifyCode();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [sandpack.files, sandpack.activeFile]);

  const debouncedUpdate = useCallback(
    debounce((code: string) => {
      sandpack.updateCurrentFile(code, false);
    }, 150),
    [sandpack.activeFile, sandpack.files],
  );

  const prettifyCode = () => {
    const activeFile = sandpack.files[sandpack.activeFile];
    const currentCode = activeFile.code;

    try {
      const fileExtension = sandpack.activeFile.split(".").pop()?.toLowerCase();
      let formattedCode = currentCode;

      if (fileExtension === "scss" || fileExtension === "css") {
        formattedCode = prettier.format(currentCode, {
          parser: "scss",
          plugins: [parserSCSS],
        });
      } else {
        formattedCode = prettier.format(currentCode, {
          parser: fileExtension === "ts" || fileExtension === "tsx" ? "typescript" : "babel",
          plugins: [parserBabel, parserTS, parserHTML],
        });
      }

      setError(false);
      setSuccess(true);
      debouncedUpdate(formattedCode);
    } catch (error) {
      setError(true);
      console.error(error);
    } finally {
      setTimeout(() => {
        setSuccess(false);
      }, 500);
    }
  };

  return { error, success, prettifyCode };
};

// Компонент с анимированными точками загрузки
function LoadingDots() {
  // Добавим глобальные стили для анимации в useEffect
  useEffect(() => {
    const styleEl = document.createElement("style");
    styleEl.innerHTML = `
      @keyframes loadingDot {
        0%, 80%, 100% { 
          transform: scale(0);
          opacity: 0.5;
        }
        40% { 
          transform: scale(1);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(styleEl);

    return () => {
      document.head.removeChild(styleEl);
    };
  }, []);

  return (
    <div
      style={{
        display: "flex",
        gap: "6px",
        justifyContent: "center",
      }}
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: "#bd93f9",
            animation: "loadingDot 1.4s infinite ease-in-out both",
            animationDelay: `${i * 0.16}s`,
          }}
        />
      ))}
    </div>
  );
}
