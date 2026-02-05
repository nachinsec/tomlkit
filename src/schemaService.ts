import * as vscode from 'vscode';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

export interface Schema {
    url: string;
    content: string;
}

export class SchemaService {
    private cacheDir: string;
    private catalogUrl = 'https://schemastore.org/api/json/catalog.json';
    private catalog: any = null;

    constructor(extensionContext: vscode.ExtensionContext) {
        this.cacheDir = path.join(extensionContext.globalStorageUri.fsPath, 'schemas');
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    private async fetchJson(url: string, redirects = 5): Promise<any> {
        if (redirects === 0) {
            throw new Error('Too many redirects');
        }

        const options = {
            headers: {
                'User-Agent': 'vscode-tomlkit'
            }
        };

        return new Promise((resolve, reject) => {
            https.get(url, options, (res) => {
                const { statusCode } = res;

                // Manejo de redirecciones (301, 302, etc)
                if (statusCode && statusCode >= 300 && statusCode < 400 && res.headers.location) {
                    resolve(this.fetchJson(res.headers.location, redirects - 1));
                    return;
                }

                if (statusCode !== 200) {
                    reject(new Error(`Request Failed. Status Code: ${statusCode}`));
                    return;
                }

                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(e);
                    }
                });
            }).on('error', (e) => {
                reject(e);
            });
        });
    }

    private async ensureCatalog(): Promise<void> {
        if (this.catalog) return;
        try {
            this.catalog = await this.fetchJson(this.catalogUrl);
            console.log('SchemaStore catalog fetched successfully');
        } catch (error) {
            console.error('Failed to fetch SchemaStore catalog:', error);
        }
    }

    public async getSchemaForFile(fileName: string): Promise<string | null> {
        await this.ensureCatalog();
        if (!this.catalog) {
            return null;
        }

        const baseName = path.basename(fileName);

        // Find which schema from the catalog applies to this file
        const mapping = this.catalog.schemas.find((s: any) => {
            if (!s.fileMatch) {
                return false;
            }
            return s.fileMatch.some((pattern: string) => {
                // Simplification: check if the pattern is in the filename
                // Catalog uses globs, we do a simple match here for now
                const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
                if (regex.test(baseName)) {
                    return true;
                }
                return false;
            });
        });

        if (!mapping) {
            return null;
        }

        return this.getSchemaContent(mapping.url);
    }

    private async getSchemaContent(url: string): Promise<string | null> {
        const cacheFileName = Buffer.from(url).toString('hex') + '.json';
        const cachePath = path.join(this.cacheDir, cacheFileName);

        // 1. Try from cache
        if (fs.existsSync(cachePath)) {
            const stats = fs.statSync(cachePath);
            const isFresh = (Date.now() - stats.mtimeMs) < 1000 * 60 * 60 * 24; // 1 día
            if (isFresh) {
                return fs.readFileSync(cachePath, 'utf8');
            }
        }

        // 2. Download if missing or stale
        try {
            console.log(`Downloading schema from: ${url}`);
            const content = await this.fetchJson(url);
            const contentStr = JSON.stringify(content);
            fs.writeFileSync(cachePath, contentStr);
            return contentStr;
        } catch (error) {
            console.error(`Failed to download schema from ${url}:`, error);
            // Fallback to stale cache if download fails
            if (fs.existsSync(cachePath)) {
                return fs.readFileSync(cachePath, 'utf8');
            }
            return null;
        }
    }
}
