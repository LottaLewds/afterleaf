import {FiMapPin} from "solid-icons/fi";
import type {ReadingDirection} from "~/game/controlPreferences";
import type {AfterleafLibraryConfig} from "~/content/libraryConfig";
import {MouseSensitivityControl} from "~/components/options/MouseSensitivityControl";
import {GamepadLookSensitivityControl} from "~/components/options/GamepadLookSensitivityControl";
import {TvScreenLightingControl} from "~/components/options/TvScreenLightingControl";
import {ReadingDirectionControl} from "~/components/options/ReadingDirectionControl";
import {TagBlacklistControl} from "~/components/options/TagBlacklistControl";
import {AdditionalLocationsControl} from "~/components/locations/AdditionalLocationsControl";

export const OptionsPanel = (props: {
  availableTags: readonly string[];
  libraryConfig: AfterleafLibraryConfig;
  onLibraryConfigChange: (config: AfterleafLibraryConfig) => void;
  onReenrollLibraryRoot: (path: string) => Promise<void>;
  reenrollableBookPaths: ReadonlySet<string>;
  blacklistedTags: readonly string[];
  defaultReadingDirection: ReadingDirection;
  gamepadLookSensitivity: number;
  mouseSensitivity: number;
  onBlacklistedTagsChange: (tags: readonly string[]) => void;
  onDefaultReadingDirectionChange: (value: ReadingDirection) => void;
  onGamepadLookSensitivityChange: (value: number) => void;
  onMouseSensitivityChange: (value: number) => void;
  onPurgeBlacklistedWorks: () => void;
  onRespectBookReadingDirectionChange: (value: boolean) => void;
  onTvScreenLightingChange: (value: boolean) => void;
  onUnstuck: () => void;
  purgeDisabled: boolean;
  purgeWorkCount: number;
  respectBookReadingDirection: boolean;
  tvScreenLighting: boolean;
}) => (
  <section class="min-w-0 overflow-y-auto px-4 pt-7 pb-12 sm:px-7 lg:px-10 lg:pt-9 xl:col-span-2">
    <div class="mx-auto max-w-4xl">
      <p class="text-[10px] font-semibold tracking-[0.2em] text-[#d55247] uppercase">Shop preferences</p>
      <h2 class="mt-2 font-serif text-3xl tracking-[-0.04em] text-[#f0ecdf] sm:text-4xl">Options</h2>
      <p class="mt-2 max-w-xl text-xs leading-5 text-[#6e7974]">
        Tune first-person controls, book handling, and which publications enter your shop.
      </p>

      <div class="mt-8 space-y-3">
        <MouseSensitivityControl value={props.mouseSensitivity} onChange={props.onMouseSensitivityChange} />
        <GamepadLookSensitivityControl
          value={props.gamepadLookSensitivity}
          onChange={props.onGamepadLookSensitivityChange}
        />
        <TvScreenLightingControl enabled={props.tvScreenLighting} onChange={props.onTvScreenLightingChange} />
        <ReadingDirectionControl
          defaultDirection={props.defaultReadingDirection}
          onDefaultDirectionChange={props.onDefaultReadingDirectionChange}
          onRespectMetadataChange={props.onRespectBookReadingDirectionChange}
          respectMetadata={props.respectBookReadingDirection}
        />
        <div class="flex flex-col gap-4 border border-white/8 bg-[#151e1c] px-4 py-4 sm:flex-row sm:items-center sm:px-5">
          <span class="grid size-9 shrink-0 place-items-center bg-[#d94c3f]/10 text-[#dc6156]">
            <FiMapPin size={15} />
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-[10px] font-semibold tracking-[0.12em] text-[#c5cec9] uppercase">Player recovery</p>
            <p class="mt-1 text-[9px] leading-4 text-[#65716c]">
              Teleport back to the first-floor entrance if you become stuck.
            </p>
          </div>
          <button
            class="shrink-0 border border-[#d94c3f]/35 bg-[#d94c3f]/10 px-4 py-2.5 text-[10px] font-semibold tracking-[0.12em] text-[#df776e] uppercase transition hover:border-[#d94c3f]/60 hover:bg-[#d94c3f]/20 hover:text-[#f3a098]"
            type="button"
            onClick={() => props.onUnstuck()}
          >
            Unstuck
          </button>
        </div>
        <AdditionalLocationsControl
          config={props.libraryConfig}
          onChange={props.onLibraryConfigChange}
          onReenroll={props.onReenrollLibraryRoot}
          reenrollableBookPaths={props.reenrollableBookPaths}
        />
        <TagBlacklistControl
          availableTags={props.availableTags}
          blacklistedTags={props.blacklistedTags}
          onChange={props.onBlacklistedTagsChange}
          onPurge={props.onPurgeBlacklistedWorks}
          purgeDisabled={props.purgeDisabled}
          purgeWorkCount={props.purgeWorkCount}
        />
      </div>
    </div>
  </section>
);
