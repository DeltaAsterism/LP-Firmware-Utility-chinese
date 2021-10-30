import React, { useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { saveAs } from "file-saver";
import { useObserver } from "mobx-react-lite";

import {
  lpModels,
  svgs,
  bltext,
  LaunchpadTypes,
  FlashableFirmwares,
  PatchTypes,
} from "../constants";
import Button from "../components/Button";
import PaletteGrid from "../components/PaletteGrid";
import { useStore } from "../hooks";
import { deviceIsBLForFW } from "../utils";
import RouteContainer from "../components/RouteContainer";
import { PatchOptions } from "../store/UIStore";
import { toJS } from "mobx";
import ReactTooltip from "react-tooltip";

const isWindows = window.navigator.platform.indexOf("Win") !== -1;

const Firmware = () => {
  const uiStore = useStore(({ ui }) => ui);
  const paletteStore = useStore(({ palette }) => palette);
  const wasmStore = useStore(({ wasm }) => wasm);
  const launchpadStore = useStore(({ launchpads }) => launchpads);
  const noticeStore = useStore(({ notice }) => notice);

  const fileRef = useRef<HTMLInputElement | null>(null);

  const flashFirmware = useCallback(
    async (
      selectedLp: FlashableFirmwares,
      options: { [key: string]: any },
      palette: { [index: number]: number[] },
      rawFW?: Uint8Array
    ) => {
      try {
        let firmware: Uint8Array = new Uint8Array();

        if (!rawFW)
          firmware = await wasmStore.patch(selectedLp, options, palette);

        let targetLp =
          selectedLp === FlashableFirmwares.CFY
            ? FlashableFirmwares.LPPRO
            : selectedLp;

        let {
          cancelFlash,
          flashPromise: startFlash,
        } = launchpadStore.queueFirmwareFlash(rawFW || firmware, targetLp);

        startFlash()
          .then(async (continueFlashing: any) => {
            if (!continueFlashing) return;
            noticeStore.show({
              text: "升级中...",
              dismissable: false,
              showProgress: true,
            });
            return await continueFlashing();
          })
          .then(noticeStore.hide);

        if (
          !launchpadStore.launchpad ||
          !deviceIsBLForFW(launchpadStore.launchpad.type, targetLp)
        )
          noticeStore.show({
            text: `请将${targetLp}进入至Bootloader模式以继续刷机`,
            dismissable: true,
            svg: `./svg/${svgs[selectedLp]}.svg`,
            bl: `你可以在Launchpad开启时按住${bltext[selectedLp]}以进入Bootloader模式`,
            callback: cancelFlash as () => void,
          });
      } catch (e) {
        noticeStore.show({
          text: e.toString(),
          dismissable: true,
        });
      }
    },
    [wasmStore, launchpadStore, noticeStore]
  );

  const downloadFirmware = useCallback(
    async (
      selectedLp: FlashableFirmwares,
      options: PatchOptions,
      palette: any
    ) => {
      try {
        const fw = await wasmStore.patch(selectedLp, options, palette);

        saveAs(new Blob([fw.buffer]), "output.syx");
      } catch (e) {
        noticeStore.show({
          text: e.toString(),
          dismissable: true,
        });
      }
    },
    [wasmStore, noticeStore]
  );

  const uploadFirmware = useCallback(
    async (file?: File) => {
      if (!file) return;
      let firmware = new Uint8Array(await file.arrayBuffer());

      try {
        const targetLp = wasmStore.verify(firmware);

        flashFirmware(targetLp, {}, paletteStore.palette, firmware);
      } catch (e) {
        noticeStore.show({
          text: e.toString(),
          dismissable: true,
        });
      }
    },
    [flashFirmware, wasmStore, paletteStore.palette, noticeStore]
  );

  const onDrop = useCallback(
    ([file]: File[]) => uiStore.konamiSuccess && uploadFirmware(file),
    [uiStore.konamiSuccess, uploadFirmware]
  );

  const { getInputProps, getRootProps, isDragActive: lightBg } = useDropzone({
    onDrop,
  });

  let containerProps = uiStore.konamiSuccess
    ? { ...getRootProps(), lightBg }
    : {};

  return useObserver(() => (
    <RouteContainer {...containerProps}>
      <select
        style={{
          width: `${uiStore.selectedFirmware.length * 0.55 + 2.5}em`,
        }}
        className="py-2 px-4 text-2xl font-normal font-sans appearance-none custom-select"
        onChange={(e) =>
          e.target.value === FlashableFirmwares.CUSTOM_SYSEX
            ? fileRef.current?.click()
            : uiStore.setSelectedFirmware(e.target.value as FlashableFirmwares)
        }
        value={uiStore.selectedFirmware}
      >
        {lpModels
          .concat(
            uiStore.konamiSuccess ? [FlashableFirmwares.CUSTOM_SYSEX] : []
          )
          .map((model) => (
            <option value={model} key={model}>
              {model}
            </option>
          ))}
      </select>

      <div className="w-auto space-y-1">
        {Object.entries(uiStore.options).map(([type, value]) => {
          let optionType = type as PatchTypes;

          return (!paletteStore.dirty ||
            uiStore.selectedFirmware === FlashableFirmwares.CFY) &&
            type === PatchTypes.Palette ? null : (
            <div className={"w-auto"} key={type}>
              <div
                data-tip={
                  type === PatchTypes.ApolloFastLED
                    ? `在Apollo Studio 1.8.1或更新的版本中,应用此模块至固件中可以显著的提升灯光速率。\n 此模块并不会影响Launchpad与其他软件的使用。`
                    : undefined
                }
              >
                <input
                  type="checkbox"
                  checked={value}
                  style={{ marginRight: 5 }}
                  onChange={() =>
                    (uiStore.options[optionType] = !uiStore.options[optionType])
                  }
                />
                <span
                  onClick={() =>
                    (uiStore.options[optionType] = !uiStore.options[optionType])
                  }
                >
                  {type}
                </span>
              </div>
              <ReactTooltip
                className="tooltip max-w-md text-center"
                effect="solid"
                place="top"
              />
            </div>
          );
        })}
      </div>

      {([
        FlashableFirmwares.LPPRO,
      ] as FlashableFirmwares[]).includes(uiStore.selectedFirmware) && (
        <p className="opacity-50 text-base text-center">
          正在寻找Apollo Studio Fast LED模块？
          <br />
          它被默认集成在CFW中！
          <br />
        </p>
      )}

      {([
        FlashableFirmwares.CFY,
      ] as FlashableFirmwares[]).includes(uiStore.selectedFirmware) && (
        <p className="opacity-50 text-base text-center">
          Apollo Studio Fast LED模块默认集成在CFW中
        </p>
      )}

      {uiStore.selectedFirmware === LaunchpadTypes.CFY && paletteStore.dirty && (
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
        !([
          FlashableFirmwares.CFY,
          FlashableFirmwares.LPPROMK3,
        ] as FlashableFirmwares[]).includes(uiStore.selectedFirmware) && (
          <div className="flex flex-col items-center py-2 space-y-2">
            <p className="text-lg">当前调色板：</p>
            <PaletteGrid width={350} />
          </div>
        )}

      <Button
        onClick={() =>
          flashFirmware(
            uiStore.selectedFirmware,
            toJS(uiStore.options),
            paletteStore.palette
          )
        }
        disabled={!launchpadStore.available}
      >
        升级
      </Button>

      <input
        {...getInputProps()}
        type="file"
        accept=".syx"
        style={{ display: "none" }}
        onChange={(e) => uploadFirmware(e.target.files?.[0])}
        ref={fileRef}
      />

      <p className="text-sm">
        <span className="opacity-25">...或</span>
        <span
          onClick={() =>
            downloadFirmware(
              uiStore.selectedFirmware,
              toJS(uiStore.options),
              paletteStore.palette
            )
          }
          className="opacity-75 cursor-pointer underline"
        >
          下载固件文件
        </span>
      </p>

      {isWindows && (
        <p className="pt-4">
          <span className="opacity-50">请勿在运行Ableton Live与Max时进行升级，同时记得安装{" "}</span>
          <a
            href="https://download.urauto.ltd/files/novation/usbmididriver.exe"
            target="_blank"
            rel="noopener noreferrer"
            className="opacity-75 underline"
          >
            Novation的USB驱动！
          </a>
        </p>
      )}
    </RouteContainer>
  ));
};

export default Firmware;
