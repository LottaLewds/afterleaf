/* @refresh reload */
import {render} from "@solidjs/web";

import {App} from "~/App";
import "~/styles.css";

const root = document.getElementById("root");

if (!root) throw new Error("Afterleaf could not find its root element.");

render(() => <App />, root);
