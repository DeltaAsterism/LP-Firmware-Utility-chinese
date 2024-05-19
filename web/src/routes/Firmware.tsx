import React, { Fragment, useRef } from "react";
import { Link } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { saveAs } from "file-saver";
import { useObserver } from "mobx-react-lite";

import {
  FirmwareConfig,
  firmwares,
  FlashableFirmware,
  Firmware,
  lpModels,
} from "../constants";
import Button from "../components/Button";
import PaletteGrid from "../components/PaletteGrid";
import { useStore } from "../hooks";
import { deviceIsBLForFW } from "../utils";
import RouteContainer from "../components/RouteContainer";
import { PatchOptions } from "../store/UIStore";
import { toJS } from "mobx";
import ReactTooltip from "react-tooltip";
import { patchMF64 } from "../store/mf64";

const isWindows = window.navigator.platform.indexOf("Win") !== -1;

const CUSTOM_SYSTEX = "自定义SysEx文件";

export default function () {
  const uiStore = useStore(({ ui }) => ui);
  const paletteStore = useStore(({ palette }) => palette);
  const wasmStore = useStore(({ wasm }) => wasm);
  const launchpadStore = useStore(({ launchpads }) => launchpads);
  const noticeStore = useStore(({ notice }) => notice);

  const fileRef = useRef<HTMLInputElement | null>(null);

  const firmwareConfig: FirmwareConfig = firmwares[uiStore.selectedFirmware];

  const flashFirmware = async (
    selectedLp: FlashableFirmware,
    options: PatchOptions,
    palette: { [index: number]: number[] },
    rawFW?: Uint8Array,
  ) => {
    try {
      const firmwareConfig = firmwares[selectedLp];

      let firmware: Uint8Array = new Uint8Array();

      if (!rawFW)
        firmware = await wasmStore.patch(selectedLp, options, palette);

      let targetLp = selectedLp === "CFY" ? "LPPRO" : selectedLp;

      let { cancelFlash, flashPromise: startFlash } =
        launchpadStore.queueFirmwareFlash(rawFW || firmware, targetLp);

      startFlash()
        .then(async (continueFlashing: any) => {
          if (!continueFlashing) return;
          noticeStore.show({
            text: "更新中...",
            dismissable: false,
            showProgress: true,
          });
          return await continueFlashing();
        })
        .then(noticeStore.hide);

      if (
        !launchpadStore.launchpad ||
        !launchpadStore.launchpad.type ||
        !deviceIsBLForFW(launchpadStore.launchpad.type, targetLp)
      )
        noticeStore.show({
          text: `请连接 ${targetLp} 并进入 Bootloader 模式以继续刷写`,
          dismissable: true,
          svg: `./svg/${firmwareConfig.svg}.svg`,
          bl: `你可以按住 ${firmwareConfig.blText} 并连接数据线启动 Launchpad 以进入 Bootloader 模式`,
          callback: cancelFlash as () => void,
        });
    } catch (e: any) {
      noticeStore.show({
        text: e.toString(),
        dismissable: true,
      });
    }
  };

  const downloadFirmware = async (
    selectedLp: FlashableFirmware,
    options: PatchOptions,
    palette: any,
  ) => {
    try {
      const isMF64 = selectedLp.endsWith("MF64");

      const fw = isMF64
        ? await patchMF64(selectedLp as any, options, palette)
        : await wasmStore.patch(selectedLp, options, palette);

      saveAs(new Blob([fw.buffer]), isMF64 ? "mf64.hex" : "output.syx");
    } catch (e: any) {
      noticeStore.show({
        text: e.toString(),
        dismissable: true,
      });
    }
  };

  const uploadFirmware = async (file?: File) => {
    if (!file) return;
    let firmware = new Uint8Array(await file.arrayBuffer());

    try {
      const targetLp = wasmStore.verify(firmware);

      flashFirmware(targetLp, {}, paletteStore.palette, firmware);
    } catch (e: any) {
      noticeStore.show({
        text: e.toString(),
        dismissable: true,
      });
    }
  };

  const onDrop = ([file]: File[]) =>
    uiStore.konamiSuccess && uploadFirmware(file);

  const {
    getInputProps,
    getRootProps,
    isDragActive: lightBg,
  } = useDropzone({
    onDrop,
  });

  let containerProps = uiStore.konamiSuccess
    ? { ...getRootProps(), lightBg }
    : {};

  return useObserver(() => (
    <RouteContainer {...containerProps}>
      <select
        style={{
          width: `${firmwareConfig.display.length * 0.55 + 2.5}em`,
        }}
        className="py-2 px-4 text-2xl font-normal font-sans appearance-none custom-select"
        onChange={(e) =>
          e.target.value === CUSTOM_SYSTEX
            ? fileRef.current?.click()
            : uiStore.setSelectedFirmware(e.target.value as FlashableFirmware)
        }
        value={uiStore.selectedFirmware}
      >
        {lpModels
          .concat(uiStore.konamiSuccess ? [CUSTOM_SYSTEX as any] : [])
          .map((model) => (
            <option value={model} key={model}>
              {model === (CUSTOM_SYSTEX as any)
                ? model
                : firmwares[model].display}
            </option>
          ))}
      </select>

      <div className="w-auto space-y-1">
        {firmwareConfig.customPalette && paletteStore.dirty && (
          <div className={"w-auto"}>
            <div>
              <input
                type="checkbox"
                checked={uiStore.options["Custom Palette"]}
                style={{ marginRight: 5 }}
                onChange={() =>
                  (uiStore.options["Custom Palette"] =
                    !uiStore.options["Custom Palette"])
                }
              />
              <span
                onClick={() =>
                  (uiStore.options["Custom Palette"] =
                    !uiStore.options["Custom Palette"])
                }
              >
                自定义调色板
              </span>
            </div>
          </div>
        )}
        {firmwareConfig.fastLED === true && (
          <div className={"w-auto"}>
            <div data-tip="在 Apollo Studio 1.8.1 或更新的版本中，应用此补丁可以大大加快灯光效果。此补丁不会在你使用其他软件时生效。">
              <input
                type="checkbox"
                checked={uiStore.options["Apollo Studio Fast LED Mod"]}
                style={{ marginRight: 5 }}
                onChange={() =>
                  (uiStore.options["Apollo Studio Fast LED Mod"] =
                    !uiStore.options["Apollo Studio Fast LED Mod"])
                }
              />
              <span
                onClick={() =>
                  (uiStore.options["Apollo Studio Fast LED Mod"] =
                    !uiStore.options["Apollo Studio Fast LED Mod"])
                }
              >
                Apollo Studio Fast LED模块
              </span>
            </div>
            <ReactTooltip
              className="tooltip max-w-md text-center"
              effect="solid"
              place="top"
            />
          </div>
        )}
        {firmwareConfig.novationIdSpoof === true && (
          <div className={"w-auto"}>
            <div data-tip="当你安装了Novation USB驱动并应用此补丁，可以使你的 MIDI Fighter 64 在Windows系统中同时连接多个应用程序。连接其他操作系统时本补丁不生效。">
              <input
                type="checkbox"
                checked={uiStore.options["Novation ID Spoof"]}
                style={{ marginRight: 5 }}
                onChange={() =>
                  (uiStore.options["Novation ID Spoof"] =
                    !uiStore.options["Novation ID Spoof"])
                }
              />
              <span
                onClick={() =>
                  (uiStore.options["Novation ID Spoof"] =
                    !uiStore.options["Novation ID Spoof"])
                }
              >
                伪装Novation VID以使用USB驱动
              </span>
            </div>
            <ReactTooltip
              className="tooltip max-w-md text-center"
              effect="solid"
              place="top"
            />
          </div>
        )}
      </div>

      {firmwareConfig.fastLED === "builtin" && (
        <p className="opacity-50 text-base text-center">
          正在寻找Apollo Studio Fast LED模块？
          <br />
          它被默认集成在CFW中！
          <br />
        </p>
      )}

      {firmwareConfig.apolloSupport === "cfw" && (
        <p className="opacity-50 text-base text-center">
          正在寻找 Apollo Studio 兼容?
          <br />
          它被默认集成在CFW中!
          <br />
        </p>
      )}

      {uiStore.selectedFirmware === "CFY" && paletteStore.dirty && (
        <p className="text-base text-center">
          <span className="opacity-50">
            通过{" "}
          </span>
          <Link to="/palette" className="opacity-75 text-white underline">
            调色
          </Link>
          <span className="opacity-50">
            {" "}将调色板导入CFW <br />
          </span>
        </p>
      )}

      {paletteStore.dirty &&
        !(["CFY", "LPPROMK3"] as Firmware[]).includes(
          uiStore.selectedFirmware,
        ) && (
          <div className="flex flex-col items-center py-2 space-y-2">
            <p className="text-lg">当前调色板：</p>
            <PaletteGrid width={350} />
          </div>
        )}

      {["MF64", "CMF64"].includes(uiStore.selectedFirmware) ? (
        <>
          <Button
            onClick={() =>
              downloadFirmware(
                uiStore.selectedFirmware,
                toJS(uiStore.options),
                paletteStore.palette,
              )
            }
          >
            下载
          </Button>
          <div className="text-sm max-w-lg text-center">
            <p className="my-1">
              <span className="opacity-25">
                通过官方软件{" "}来安装固件
              </span>
              <a
                href="https://store.djtechtools.com/pages/midi-fighter-utility"
                target="_blank"
                rel="noopener noreferrer"
                className="opacity-75 cursor-pointer underline"
              >
                Midi Fighter Utility
              </a>
            </p>
            <div className="whitespace-pre-wrap text-center">
              <span className="opacity-25">
                连接你的 MIDI Fighter 64，接着定向到
              </span>
              <br />
              {["Tools", "Midifighter", "Load Custom Firmware", "For a 64"].map(
                (str, i) => (
                  <Fragment key={i}>
                    {i !== 0 && <span className="mx-1 opacity-50">{"->"}</span>}
                    <span className="bg-black px-1 py-0.5 rounded opacity-75">
                      {str}
                    </span>
                  </Fragment>
                ),
              )}
              <br />
              <span className="opacity-25">
                然后选择你刚刚下载的固件文件安装。
              </span>
            </div>
          </div>
        </>
      ) : (
        <>
          <Button
            onClick={() =>
              flashFirmware(
                uiStore.selectedFirmware,
                toJS(uiStore.options),
                paletteStore.palette,
              )
            }
            disabled={!launchpadStore.available}
          >
            更新
          </Button>
          <p className="text-sm">
            <span className="opacity-25">...或者 </span>
            <span
              onClick={() =>
                downloadFirmware(
                  uiStore.selectedFirmware,
                  toJS(uiStore.options),
                  paletteStore.palette,
                )
              }
              className="opacity-75 cursor-pointer underline"
            >
              下载单独固件文件
            </span>
          </p>
        </>
      )}

      <input
        {...getInputProps()}
        type="file"
        accept=".syx"
        style={{ display: "none" }}
        onChange={(e) => uploadFirmware(e.target.files?.[0])}
        ref={fileRef}
      />

      {isWindows && (
        <p className="pt-4">
          <span className="opacity-50">请勿在运行Ableton Live时进行升级，同时记得安装{" "}</span>
          <a
            href="https://box.arkitosekai.net/res/driver"
            target="_blank"
            rel="noopener noreferrer"
            className="opacity-75 underline"
          >
            Novation USB驱动
          </a>
        </p>
      )}
    </RouteContainer>
  ));
}
