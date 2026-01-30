import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Definimos la interfaz para el JSON que viene de Rust
interface ValidationResult {
	valid: boolean;
	line?: number;
	column?: number;
	end_line?: number;
	end_column?: number;
	message?: string;
}

let validateToml: ((content: string) => string) | null = null;
const diagnosticCollection = vscode.languages.createDiagnosticCollection('tomlkit');

export async function activate(context: vscode.ExtensionContext) {
	console.log('tomlkit is activating...');

	const wasmPath = path.join(context.extensionPath, 'dist', 'wasm', 'tomlkit_core_bg.wasm');
	const jsPath = path.join(context.extensionPath, 'dist', 'wasm', 'tomlkit_core.js');

	function updateDiagnostics(document: vscode.TextDocument) {
		const isToml = document.languageId === 'toml' || document.fileName.endsWith('.toml');
		if (!isToml || !validateToml) {
			return;
		}

		const content = document.getText();
		const jsonResult = validateToml(content);
		const result: ValidationResult = JSON.parse(jsonResult);

		if (!result.valid && result.line !== undefined && result.column !== undefined) {
			const range = new vscode.Range(
				result.line,
				result.column,
				result.end_line ?? result.line,
				result.end_column ?? (result.column + 1)
			);

			const diagnostic = new vscode.Diagnostic(
				range,
				result.message || "Syntax error TOML",
				vscode.DiagnosticSeverity.Error
			);

			diagnosticCollection.set(document.uri, [diagnostic]);
		} else {
			diagnosticCollection.set(document.uri, []);
		}
	}

	if (fs.existsSync(wasmPath) && fs.existsSync(jsPath)) {
		try {
			const wasmModule = await import(jsPath);

			const wasmBinary = fs.readFileSync(wasmPath);
			await wasmModule.default(wasmBinary);

			validateToml = wasmModule.validate_toml;
			console.log('WASM loaded successfully!');

			if (vscode.window.activeTextEditor) {
				updateDiagnostics(vscode.window.activeTextEditor.document);
			}
		} catch (error) {
			console.error('Failed to load WASM:', error);
		}
	} else {
		console.error('WASM files not found at paths:', { wasmPath, jsPath });
	}

	const disposable = vscode.commands.registerCommand('tomlkit.helloWorld', () => {
		if (validateToml) {
			const result = validateToml('[package]\nname = "test"');
			vscode.window.showInformationMessage(`WASM Test: ${result}`);
		} else {
			vscode.window.showErrorMessage('WASM not loaded yet');
		}
	});

	context.subscriptions.push(
		disposable,
		diagnosticCollection,
		vscode.workspace.onDidOpenTextDocument(updateDiagnostics),
		vscode.workspace.onDidChangeTextDocument(e => updateDiagnostics(e.document)),
		vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor) {
				updateDiagnostics(editor.document);
			}
		})
	);
}

export function deactivate() { }