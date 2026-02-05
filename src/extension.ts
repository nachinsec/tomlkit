import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SchemaService } from './schemaService';

// Define the interface for syntax validation results from Rust
interface ValidationResult {
	valid: boolean;
	line?: number;
	column?: number;
	end_line?: number;
	end_column?: number;
	message?: string;
}

// Interface for schema validation results
interface SchemaValidationResult {
	valid: boolean;
	errors: { path: string; message: string }[];
}

let validateToml: ((content: string) => string) | null = null;
let validateWithSchema: ((content: string, schema: string) => string) | null = null;
let schemaService: SchemaService | null = null;

const diagnosticCollection = vscode.languages.createDiagnosticCollection('tomlkit');

export async function activate(context: vscode.ExtensionContext) {
	console.log('tomlkit is activating...');

	schemaService = new SchemaService(context);

	const wasmPath = path.join(context.extensionPath, 'dist', 'wasm', 'tomlkit_core_bg.wasm');
	const jsPath = path.join(context.extensionPath, 'dist', 'wasm', 'tomlkit_core.js');

	async function updateDiagnostics(document: vscode.TextDocument) {
		const isToml = document.languageId === 'toml' || document.fileName.endsWith('.toml');
		if (!isToml || !validateToml) {
			return;
		}

		const content = document.getText();
		const diagnostics: vscode.Diagnostic[] = [];

		// 1. Syntax Validation (Pure Rust)
		const jsonResult = validateToml(content);
		const result: ValidationResult = JSON.parse(jsonResult);

		if (!result.valid && result.line !== undefined && result.column !== undefined) {
			const range = new vscode.Range(
				result.line,
				result.column,
				result.end_line ?? result.line,
				result.end_column ?? (result.column + 1)
			);

			diagnostics.push(new vscode.Diagnostic(
				range,
				result.message || "Syntax error TOML",
				vscode.DiagnosticSeverity.Error
			));
		}

		// 2. Schema Validation (Dynamic)
		if (result.valid && schemaService && validateWithSchema) {
			try {
				const schemaContent = await schemaService.getSchemaForFile(document.fileName);

				if (schemaContent) {
					const schemaResultJson = validateWithSchema(content, schemaContent);
					const schemaResult: SchemaValidationResult = JSON.parse(schemaResultJson);

					console.log(`[tomlkit] Validation for ${path.basename(document.fileName)}: ${schemaResult.valid ? 'Valid' : 'Invalid'}`);

					if (!schemaResult.valid) {
						for (const error of schemaResult.errors) {
							// Rudimentary mapping: search for the key in text
							const parts = error.path.split('/').filter(p => p.length > 0);
							const key = parts[parts.length - 1] || 'root';
							const index = content.indexOf(key);

							let range: vscode.Range;
							if (index !== -1 && key !== 'root') {
								range = new vscode.Range(
									document.positionAt(index),
									document.positionAt(index + key.length)
								);
							} else {
								range = new vscode.Range(0, 0, 0, 1);
							}

							diagnostics.push(new vscode.Diagnostic(
								range,
								`Schema Error: ${error.message} (at ${error.path})`,
								vscode.DiagnosticSeverity.Warning
							));
						}
					}
				} else {
					console.log(`[tomlkit] No schema matched for ${path.basename(document.fileName)}`);
				}
			} catch (err) {
				console.error('[tomlkit] Schema validation error:', err);
			}
		}

		diagnosticCollection.set(document.uri, diagnostics);
	}

	if (fs.existsSync(wasmPath) && fs.existsSync(jsPath)) {
		try {
			const wasmModule = await import(jsPath);

			const wasmBinary = fs.readFileSync(wasmPath);
			await wasmModule.default(wasmBinary);

			validateToml = wasmModule.validate_toml;
			validateWithSchema = wasmModule.validate_with_schema;
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

	const debugSchemaCmd = vscode.commands.registerCommand('tomlkit.debugSchema', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor || !schemaService) {
			vscode.window.showErrorMessage('No active editor or SchemaService not initialized');
			return;
		}

		const fileName = editor.document.fileName;
		vscode.window.showInformationMessage(`Testing schema for ${path.basename(fileName)}...`);

		try {
			const schema = await schemaService.getSchemaForFile(fileName);
			if (schema) {
				vscode.window.showInformationMessage(`Schema found! Length: ${schema.length} characters.`);
			} else {
				vscode.window.showWarningMessage(`No schema found in SchemaStore for ${path.basename(fileName)}.`);
			}
		} catch (e) {
			vscode.window.showErrorMessage(`Schema error: ${e}`);
		}
	});

	context.subscriptions.push(
		disposable,
		debugSchemaCmd,
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