import {createSignal, onSettled} from "solid-js";
import {browseLibraryLocation, type LibraryDirectoryListing} from "~/content/libraryUpdate/browserClient";

/** Shared state machine for the server-backed directory browser dialog. */
export const createFolderBrowser = () => {
  const [listing, setListing] = createSignal<LibraryDirectoryListing>();
  const [browserOpen, setBrowserOpen] = createSignal(false);
  const [browserError, setBrowserError] = createSignal("");
  const [browserPending, setBrowserPending] = createSignal(false);
  const [confirmedPathInput, setConfirmedPathInput] = createSignal("");
  const [pathInput, setPathInput] = createSignal("");
  let browseRequest = 0;
  let browseTimer: ReturnType<typeof setTimeout> | undefined;
  const openBrowser = async (
    directory?: string,
    options: {
      preserveTrailingSeparator?: boolean;
      reportError?: boolean;
    } = {},
  ) => {
    const request = ++browseRequest;
    if (browseTimer) clearTimeout(browseTimer);
    browseTimer = undefined;
    setBrowserError("");
    setBrowserPending(true);
    try {
      const nextListing = await browseLibraryLocation(directory);
      if (request !== browseRequest) return;
      const displayedPath =
        options.preserveTrailingSeparator && directory && /[\\/]$/u.test(directory) ? directory : nextListing.path;
      setListing(nextListing);
      setPathInput(displayedPath);
      setConfirmedPathInput(displayedPath);
      setBrowserOpen(true);
    } catch (error) {
      if (request !== browseRequest || options.reportError === false) return;
      setBrowserError(error instanceof Error ? error.message : "Could not browse that folder");
    } finally {
      if (request === browseRequest) setBrowserPending(false);
    }
  };
  const navigateToPath = () => {
    const path = pathInput().trim();
    if (!path) return;
    void openBrowser(path, {
      preserveTrailingSeparator: true,
      reportError: false,
    });
  };
  const schedulePathNavigation = () => {
    if (browseTimer) clearTimeout(browseTimer);
    browseRequest += 1;
    setBrowserPending(false);
    setBrowserError("");
    const path = pathInput().trim();
    if (!path) return;
    if (path === listing()?.path) {
      setConfirmedPathInput(path);
      return;
    }
    browseTimer = setTimeout(navigateToPath, 300);
  };
  const canChooseCurrentFolder = () => !browserPending() && pathInput().trim() === confirmedPathInput();
  const close = () => setBrowserOpen(false);
  onSettled(() => () => {
    if (browseTimer) clearTimeout(browseTimer);
    browseRequest += 1;
  });
  return {
    browserError,
    browserOpen,
    browserPending,
    canChooseCurrentFolder,
    close,
    listing,
    navigateToPath,
    openBrowser,
    pathInput,
    schedulePathNavigation,
    setBrowserError,
    setPathInput,
  };
};

export type FolderBrowser = ReturnType<typeof createFolderBrowser>;
