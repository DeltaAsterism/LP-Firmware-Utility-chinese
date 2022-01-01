import React from "react";
import ReactDOM from "react-dom";
import 'mobx-react-lite/batchingForReactDom'
import { HashRouter } from "react-router-dom";

import "./index.css";
import "./assets/main.css";
import App from "./App";
import { StoreContext, store } from "./store";

ReactDOM.render(
  <StoreContext.Provider value={store}>
    <HashRouter>
      <App />
    </HashRouter>
  </StoreContext.Provider>,
  document.getElementById("root")
);
