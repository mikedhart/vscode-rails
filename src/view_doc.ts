import * as vscode from 'vscode';
import * as path from 'path';
import axios, { AxiosRequestConfig } from 'axios';
import { RAILS } from './symbols/rails';
import { RUBY, VERSION } from './symbols/ruby';
// Track currently webview panel
// var currentPanel: vscode.WebviewPanel | undefined = undefined;

function injectBase(html, base) {
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src vscode-resource: http:; script-src vscode-resource: http: 'unsafe-inline' ; style-src vscode-resource: http: 'unsafe-inline';">`;
  const _base = path.dirname(base) + '/';
  // Remove any <base> elements inside <head>
  let _html = html.replace(
    /(<[^>/]*head[^>]*>)[\s\S]*?(<[^>/]*base[^>]*>)[\s\S]*?(<[^>]*head[^>]*>)/gim,
    '$1 $3'
  );

  // Add <base> just before </head>
  _html = _html.replace(
    /<head>/gim,
    `<head><base href="${_base}">\n${policy}\n<style> body{margin:20px;}</style>`
  );
  return _html;
}

const CancelToken = axios.CancelToken;
const source = CancelToken.source();

function showSide(
  symbol: string,
  html: string,
  context: vscode.ExtensionContext
) {
  // const columnToShowIn = vscode.window.activeTextEditor
  //   ? vscode.window.activeTextEditor.viewColumn
  //   : undefined;
  // if (currentPanel) {
  //   // If we already have a panel, show it in the target column
  //   currentPanel.webview.html = html;
  //   currentPanel.title = `Document ${symbol}`;
  //   currentPanel.reveal(columnToShowIn);
  // } else {
  const currentPanel = vscode.window.createWebviewPanel(
    'Document',
    `Document ${symbol}`,
    vscode.ViewColumn.Two,
    {
      // Enable scripts in the webview
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  currentPanel.webview.html = html;
  // Reset when the current panel is closed
  // currentPanel.onDidDispose(
  //   () => {
  //     currentPanel = undefined;
  //     source.cancel('request canceled as WebviewPanel Disposed.');
  //   },
  //   null,
  //   context.subscriptions
  // );
}

function doRequest(
  this: vscode.ExtensionContext,
  _url: string,
  symbol: string
) {
  const request = axios({
    url: _url,
    timeout: 5e3,
    cancelToken: source.token,
  })
    .then((r: { data: any }) => {
      if (typeof r.data === 'string') {
        const html = injectBase(r.data, _url);
        showSide(symbol, html, this);
      } else {
        const html = 'No valid response content.';
        showSide(symbol, html, this);
      }
    })
    .catch((err) => {
      console.error(err);
      showSide(symbol, err.toString(), this);
    });
}

export function viewDoc(this: vscode.ExtensionContext) {
  const document = vscode.window.activeTextEditor.document;
  const position = vscode.window.activeTextEditor.selection.active;
  const wordRange = document.getWordRangeAtPosition(position);
  if (typeof wordRange === 'undefined') {
    showSide(
      'word range not found',
      "Can't find word range from your active editor selection.",
      this
    );
  }
  const word = document.getText(wordRange);
  const lineStartToWord = document
    .getText(
      new vscode.Range(new vscode.Position(position.line, 0), wordRange.end)
    )
    .trim();
  const symbol = new RegExp('(((::)?[A-Za-z]+)*(::)?' + word + ')').exec(
    lineStartToWord
  )[1];
  console.log(`symbol:${symbol}`);
  let endpoint = '';
  const isRailsSymbol = RAILS.has(symbol.toLowerCase());
  const isRubySymbol = RUBY.has(symbol.toLowerCase());
  console.log(`isRailsSymbol:${isRailsSymbol},isRubySymbol:${isRubySymbol}`);
  if (symbol && (isRailsSymbol || isRubySymbol)) {
    endpoint = symbol.replace('::', '/');
  }
  console.log(`symbol:${symbol},endpoint:${endpoint}`);
  if (endpoint === null) {
    return;
  }
  let url = '';
  if (isRubySymbol) {
    url = `https://docs.rubydocs.org/ruby-${VERSION.replace(
      /\./g,
      '-'
    )}/classes/${endpoint}.html`;
  } else if (isRailsSymbol) {
    url = `https://api.rubyonrails.org/classes/${endpoint}.html`;
  } else {
    showSide(symbol, 'No matched symbol on extension side.', this);
    return;
  }
  console.log(isRailsSymbol, isRubySymbol, url);
  // let info = vscode.window.showInformationMessage("Rails:Document-loading...")
  doRequest.call(this, url, symbol);
}
