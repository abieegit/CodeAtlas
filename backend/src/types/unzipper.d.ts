declare module "unzipper" {
    import { Readable } from "stream";

    interface ZipEntry {
        path: string;
        type: "File" | "Directory";
        stream(): Readable;
    }

    interface OpenZip {
        files: ZipEntry[];
        extract(options: { path: string }): Promise<void>;
    }

    interface Unzipper {
        Open: {
            file(path: string): Promise<OpenZip>;
        };
    }

    const unzipper: Unzipper;
    export = unzipper;
}
