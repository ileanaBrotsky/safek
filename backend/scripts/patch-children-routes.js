// backend/scripts/patch-children-routes.js
// SCRIPT PARA APLICAR PARCHE MÍNIMO AL ARCHIVO children.js

const fs = require('fs');
const path = require('path');

function patchChildrenRoutes() {
  const filePath = path.join(__dirname, '../src/routes/children.js');
  
  // Leer el archivo actual
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Contador de cambios
  let changesCount = 0;
  
  // CAMBIO 1: En la función generate-code (alrededor de línea 235)
  // Buscar: WHERE id = $1 AND family_id = (SELECT id FROM families WHERE user_id = $2)
  // Reemplazar con: WHERE id = $1 AND family_id = $2
  const pattern1 = /WHERE id = \$1 AND family_id = \(SELECT id FROM families WHERE user_id = \$2\)/g;
  const replacement1 = 'WHERE id = $1 AND family_id = $2';
  
  if (content.match(pattern1)) {
    content = content.replace(pattern1, replacement1);
    changesCount++;
    console.log('✅ Cambio 1: Corregido query en generate-code');
  }
  
  // CAMBIO 2: En la función registration-code (alrededor de línea 338)
  // Buscar: SELECT name FROM children WHERE id = $1 AND family_id = (SELECT id FROM families WHERE user_id = $2)
  // Reemplazar con: SELECT name FROM children WHERE id = $1 AND family_id = $2
  const pattern2 = /SELECT name FROM children WHERE id = \$1 AND family_id = \(SELECT id FROM families WHERE user_id = \$2\)/g;
  const replacement2 = 'SELECT name FROM children WHERE id = $1 AND family_id = $2';
  
  if (content.match(pattern2)) {
    content = content.replace(pattern2, replacement2);
    changesCount++;
    console.log('✅ Cambio 2: Corregido query en registration-code');
  }
  
  // CAMBIO 3: En la función device-status (alrededor de línea 390)
  // Buscar el query complejo con LEFT JOIN y families
  const pattern3 = /WHERE c\.id = \$1\s+AND c\.family_id = \(SELECT id FROM families WHERE user_id = \$2\)/g;
  const replacement3 = 'WHERE c.id = $1 \n         AND c.family_id = $2';
  
  if (content.match(pattern3)) {
    content = content.replace(pattern3, replacement3);
    changesCount++;
    console.log('✅ Cambio 3: Corregido query en device-status');
  }
  
  // Si no se encontraron los patrones exactos, buscar variaciones
  if (changesCount === 0) {
    console.log('⚠️ No se encontraron los patrones exactos, buscando variaciones...');
    
    // Buscar cualquier referencia a "families WHERE user_id"
    const generalPattern = /families WHERE user_id/g;
    const matches = content.match(generalPattern);
    
    if (matches) {
      console.log(`   Encontradas ${matches.length} referencias a "families WHERE user_id"`);
      
      // Reemplazar las referencias problemáticas
      content = content.replace(
        /AND family_id = \(SELECT id FROM families WHERE user_id = \$\d+\)/g,
        'AND family_id = $2'
      );
      
      content = content.replace(
        /WHERE c\.family_id = \(SELECT id FROM families WHERE user_id = \$\d+\)/g,
        'WHERE c.family_id = $2'
      );
      
      console.log('✅ Aplicados parches generales');
      changesCount = matches.length;
    }
  }
  
  if (changesCount > 0) {
    // Crear backup del archivo original
    const backupPath = filePath + '.backup_' + Date.now();
    fs.copyFileSync(filePath, backupPath);
    console.log(`📁 Backup creado: ${backupPath}`);
    
    // Escribir el archivo parcheado
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`\n✅ PARCHE APLICADO: ${changesCount} cambios realizados`);
    console.log('📝 El archivo children.js ha sido actualizado');
    console.log('   - Los queries ahora usan family_id directamente');
    console.log('   - family_id en children apunta a users.id');
    
    return true;
  } else {
    console.log('\n⚠️ No se necesitaron cambios o el archivo ya está parcheado');
    return false;
  }
}

// Ejecutar el parche
if (require.main === module) {
  console.log('🔧 INICIANDO PARCHE DE children.js\n');
  console.log('Este script solo cambia las referencias problemáticas a la tabla families');
  console.log('Mantiene TODO el código existente intacto\n');
  
  try {
    const result = patchChildrenRoutes();
    if (result) {
      console.log('\n🎉 Parche completado exitosamente');
      console.log('📌 Siguiente paso: Reiniciar el backend con docker-compose restart backend');
    } else {
      console.log('\n📌 No se requirieron cambios');
    }
  } catch (error) {
    console.error('\n❌ Error aplicando parche:', error.message);
    process.exit(1);
  }
}