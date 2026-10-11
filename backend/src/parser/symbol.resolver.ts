import * as ts from "typescript";
import * as path from "path";

export interface SymbolResolver {
    resolveCallFromLocation(
        filePath: string,
        position: number
    ): string | null;
}

export function createSymbolResolver(
    repositoryRoot: string,
    absoluteSourceFiles: string[]
): SymbolResolver {

    const absoluteRepositoryRoot =
        path.resolve(repositoryRoot);

    /*
     * IMPORTANT:
     * TypeScript receives absolute source-file paths.
     * This prevents TypeScript from accidentally resolving
     * files relative to the wrong directory.
     */
    const normalizedSourceFiles =
        absoluteSourceFiles.map(
            (filePath) =>
                path.resolve(filePath)
        );

    const program =
        ts.createProgram(
            normalizedSourceFiles,
            {
                target: ts.ScriptTarget.ES2020,
                module: ts.ModuleKind.CommonJS,
                moduleResolution: ts.ModuleResolutionKind.NodeJs,
                allowJs: true,
                skipLibCheck: true
            }
        );

    const checker =
        program.getTypeChecker();

    function getSourceFile(
        filePath: string
    ): ts.SourceFile | undefined {

        const requestedPath =
            path
                .resolve(filePath)
                .replace(/\\/g, "/")
                .toLowerCase();

        for (
            const sourceFile
            of program.getSourceFiles()
        ) {

            const programPath =
                path
                    .resolve(sourceFile.fileName)
                    .replace(/\\/g, "/")
                    .toLowerCase();

            if (
                programPath === requestedPath
            ) {
                return sourceFile;
            }
        }

        return undefined;
    }

    function getCodeAtlasId(
        declaration: ts.Declaration
    ): string | null {

        const sourceFile =
            declaration.getSourceFile();

        const absoluteFilePath =
            path.resolve(
                sourceFile.fileName
            );

        /*
         * CodeAtlas IDs use paths relative to
         * the backend/project root.
         *
         * Example:
         * function:src/test-project/userService.ts:getUser
         */
        const relativeFilePath =
            path
                .relative(
                    absoluteRepositoryRoot,
                    absoluteFilePath
                )
                .replace(/\\/g, "/");

        if (
            ts.isFunctionDeclaration(
                declaration
            )
        ) {

            const name =
                declaration.name?.text;

            if (!name) {
                return null;
            }

            return (
                `function:${relativeFilePath}:${name}`
            );
        }

        if (
            ts.isMethodDeclaration(
                declaration
            )
        ) {

            const name =
                declaration.name;

            if (
                !ts.isIdentifier(name)
            ) {
                return null;
            }

            /*
             * Method ids are qualified with the enclosing
             * class name, matching entity.extractor.
             */
            const parent =
                declaration.parent;

            let className: string | null = null;

            if (
                ts.isClassDeclaration(parent) ||
                ts.isClassExpression(parent)
            ) {
                className =
                    parent.name?.text ?? null;
            }

            return className
                ? `method:${relativeFilePath}:${className}:${name.text}`
                : `method:${relativeFilePath}:${name.text}`;
        }

        /*
         * const/arrow function assigned to a variable
         * (`const x = () => {}` / `const x = function () {}`) is emitted
         * as a Function entity by entity.extractor, so calls INTO it must
         * resolve to the same id.
         */
        if (ts.isVariableDeclaration(declaration)) {

            const name = declaration.name;

            if (!ts.isIdentifier(name)) {
                return null;
            }

            const initializer = declaration.initializer;

            const isFunctionValue =
                initializer !== undefined &&
                (ts.isArrowFunction(initializer) ||
                    ts.isFunctionExpression(initializer));

            if (!isFunctionValue) {
                return null;
            }

            return `function:${relativeFilePath}:${name.text}`;
        }

        return null;
    }

    function findCallExpression(
        sourceFile: ts.SourceFile,
        position: number
    ): ts.CallExpression | null {

        let result:
            ts.CallExpression | null = null;

        function visit(
            node: ts.Node
        ): void {

            const start =
                node.getStart(
                    sourceFile
                );

            const end =
                node.getEnd();

            if (
                position < start ||
                position > end
            ) {
                return;
            }

            if (
                ts.isCallExpression(node)
            ) {

                /*
                 * Keep descending so that the
                 * innermost call containing the
                 * position wins. This makes nested
                 * calls such as outer(inner())
                 * resolve to the correct callee.
                 */
                result = node;
            }

            ts.forEachChild(
                node,
                visit
            );
        }

        visit(sourceFile);

        return result;
    }

    function resolveCallFromLocation(
        filePath: string,
        position: number
    ): string | null {

        const absoluteFilePath =
            path.isAbsolute(filePath)
                ? filePath
                : path.resolve(filePath);

        const sourceFile =
            getSourceFile(
                absoluteFilePath
            );

        if (!sourceFile) {
            console.log(
                "TypeScript SourceFile not found:",
                absoluteFilePath
            );

            return null;
        }

        const callExpression =
            findCallExpression(
                sourceFile,
                position
            );

        if (!callExpression) {
            console.log(
                "CallExpression not found"
            );

            return null;
        }

        const symbol =
            checker.getSymbolAtLocation(
                callExpression.expression
            );

        if (!symbol) {
            console.log(
                "Symbol not found"
            );

            return null;
        }

        let resolvedSymbol =
            symbol;

        if (
            symbol.flags &
            ts.SymbolFlags.Alias
        ) {

            resolvedSymbol =
                checker.getAliasedSymbol(
                    symbol
                );
        }

        const declarations =
            resolvedSymbol.declarations;

        if (
            !declarations ||
            declarations.length === 0
        ) {

            console.log(
                "Declaration not found"
            );

            return null;
        }

        return getCodeAtlasId(
            declarations[0]
        );
    }

    return {
        resolveCallFromLocation
    };
}